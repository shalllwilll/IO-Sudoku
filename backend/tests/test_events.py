import json
import time

import pytest

from app.core.events import EVENT_MODELS, parse_event
from tests.api_helpers import make_client, new_project, simple_rows, upload, xlsx_bytes
from tests.test_api_flow import run_project
from tests.test_tq_answers import cable_rows


def read_stream(client, url, headers=None):
    events = []
    with client.stream("GET", url, headers=headers or {}) as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        block = {}
        for line in r.iter_lines():
            if line == "":
                if block:
                    events.append(block)
                    block = {}
                continue
            k, _, v = line.partition(": ")
            block[k] = v
    return events


def stream_url(pid, run):
    return f"/api/projects/{pid}/runs/{run['id']}/events"


def types(events):
    return [e["event"] for e in events]


@pytest.fixture
def finished(tmp_path):
    c = make_client(tmp_path)
    pid, run = run_project(c, tmp_path)
    return c, pid, run


def test_stream_order(finished):  # T9.2.1
    c, pid, run = finished
    ev = read_stream(c, stream_url(pid, run))
    t = types(ev)
    assert t[0] == "run.started" and t[-1] == "run.finished"
    assert t.count("run.started") == t.count("run.finished") == 1
    stages = [json.loads(e["data"])["data"]["stage"] for e in ev if e["event"] == "stage.started"]
    assert stages == ["ingest", "map", "normalise", "hardware", "layout", "pack"]
    assert t.index("stage.finished") > t.index("stage.started")
    assert {"group.formed", "placement", "spare.assigned", "solver.status",
            "validation.result"} <= set(t)  # fmt: skip
    assert [int(e["id"]) for e in ev] == list(range(1, len(ev) + 1))


def test_replay_is_the_same_sequence(finished):  # T9.2.2
    c, pid, run = finished
    a = read_stream(c, stream_url(pid, run))
    b = read_stream(c, stream_url(pid, run))
    assert a == b and len(a) > 5


def test_resume_has_no_gaps_or_duplicates(finished):  # T9.2.3
    c, pid, run = finished
    full = read_stream(c, stream_url(pid, run))
    cut = len(full) // 2
    rest = read_stream(c, stream_url(pid, run), {"Last-Event-ID": full[cut - 1]["id"]})
    assert full[:cut] + rest == full
    via_query = read_stream(c, stream_url(pid, run) + f"?last_event_id={full[cut - 1]['id']}")
    assert via_query == rest
    assert read_stream(c, stream_url(pid, run), {"Last-Event-ID": full[-1]["id"]}) == []
    bad = c.get(stream_url(pid, run), headers={"Last-Event-ID": "abc"})
    assert bad.status_code == 400 and bad.json()["code"] == "bad_last_event_id"


def test_two_clients_get_the_full_stream(finished):  # T9.2.5
    c, pid, run = finished
    first = read_stream(c, stream_url(pid, run))
    second = read_stream(make_client_like(c), stream_url(pid, run))
    assert first == second


def make_client_like(c):
    return c  # the same app, a second subscriber


def test_every_event_matches_its_model(finished):  # T9.2.8
    c, pid, run = finished
    seen = set()
    for e in read_stream(c, stream_url(pid, run)):
        env = json.loads(e["data"])
        assert env["type"] == e["event"] and env["seq"] == int(e["id"])
        parse_event(env["type"], env["data"])
        seen.add(env["type"])
    assert seen <= set(EVENT_MODELS)
    with pytest.raises(ValueError):
        parse_event("nope", {})


def test_crash_ends_with_error_event_and_failed_status(tmp_path, monkeypatch):  # T9.2.4
    from app.core import pipeline

    def boom(*_a, **_k):
        raise RuntimeError("injected")

    monkeypatch.setattr(pipeline, "build_blocks", boom)
    c = make_client(tmp_path)
    pid = new_project(c)
    upload(c, pid, xlsx_bytes(tmp_path, simple_rows()))
    r = c.post(f"/api/projects/{pid}/runs", json={}).json()
    got = c.get(f"/api/projects/{pid}/runs/{r['id']}").json()
    assert got["status"] == "failed" and "injected" in got["error"]
    ev = read_stream(c, stream_url(pid, r))
    assert types(ev)[0] == "run.started" and types(ev)[-1] == "error"
    assert json.loads(ev[-1]["data"])["data"]["code"] == "RuntimeError"
    assert c.get("/api/health").status_code == 200
    assert c.get(f"/api/projects/{pid}/runs/{r['id']}/allocation").status_code == 409


def test_large_run_is_coalesced(tmp_path):  # T9.2.6
    rows = [r for i in range(170) for r in cable_rows(f"320-CE-{i:04d}", 12)]
    assert len(rows) > 2000
    c = make_client(tmp_path)
    pid, run = run_project(c, tmp_path, rows)
    t0 = time.perf_counter()
    ev = read_stream(c, stream_url(pid, run))
    assert time.perf_counter() - t0 < 5
    batches = [json.loads(e["data"])["data"] for e in ev if e["event"] == "placement"]
    assert 2 <= len(batches) <= 40 and max(b["count"] for b in batches) <= 100
    assert sum(b["count"] for b in batches) == run["summary"]["occupied"]
    assert len(ev) < 400


def test_persistence_survives_a_restart(tmp_path):  # T9.2.7
    c = make_client(tmp_path)
    pid, run = run_project(c, tmp_path)
    before = read_stream(c, stream_url(pid, run))
    c2 = make_client(tmp_path)  # a new app on the same database file
    again = c2.get(f"/api/projects/{pid}/runs/{run['id']}").json()
    assert again["status"] == "finished" and again["summary"] == run["summary"]
    assert c2.get(f"/api/projects/{pid}/runs/{run['id']}/allocation").status_code == 200
    assert read_stream(c2, stream_url(pid, run)) == before


def test_interrupted_run_is_failed_on_restart(tmp_path):
    c = make_client(tmp_path)
    pid = new_project(c)
    upload(c, pid, xlsx_bytes(tmp_path, simple_rows()))
    svc = c.app.state.service
    rid = svc.begin(svc.store.project(pid), {})  # started, never executed: a crash mid-run
    c2 = make_client(tmp_path)
    got = c2.get(f"/api/projects/{pid}/runs/{rid}").json()
    assert got["status"] == "failed"
    ev = read_stream(c2, f"/api/projects/{pid}/runs/{rid}/events")
    assert types(ev) == ["run.started", "error"]


def test_unknown_run_and_other_project_cannot_stream(finished):
    c, pid, run = finished
    other = new_project(c)
    for url in (
        f"/api/projects/{pid}/runs/nope/events",
        f"/api/projects/{other}/runs/{run['id']}/events",
    ):
        r = c.get(url)
        assert r.status_code == 404 and r.json()["code"] == "not_found"


def test_rejections_and_tqs_are_streamed(tmp_path):
    c = make_client(tmp_path)
    pid, run = run_project(
        c, tmp_path, cable_rows("320-CE-0001", 3, io="XX") + cable_rows("320-CE-0002", 4)
    )
    ev = read_stream(c, stream_url(pid, run))
    rej = [json.loads(e["data"])["data"] for e in ev if e["event"] == "rejection"]
    assert [(r["code"], r["signals"]) for r in rej] == [
        ("TQ-VALUE", 3)
    ]  # one rejection per distinct reason
    tqs = [json.loads(e["data"])["data"] for e in ev if e["event"] == "tq.raised"]
    assert {t["code"] for t in tqs} == {"TQ-VALUE"} and len(tqs) == 3
