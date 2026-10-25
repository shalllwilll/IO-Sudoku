"""Walk the demo story against a running server and print what a judge would see.

    python scripts/demo_smoke.py [http://localhost:8000]

Exits non-zero on the first step that fails, so it doubles as a pre-demo check.
"""

import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"


def call(method: str, path: str, body: dict | None = None, raw: bool = False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
            return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        sys.exit(f"FAIL {method} {path}: {e.code} {e.read()[:200]!r}")


def step(name: str, t0: float, detail: str = "") -> None:
    print(f"ok  {time.time() - t0:5.1f}s  {name}  {detail}")


t = time.time()
sample = call("POST", "/demo/sample")
pid, rid = sample["project_id"], sample["run_id"]
step("load sample plant", t, f"created={sample['created']}")

t = time.time()
while (run := call("GET", f"/projects/{pid}/runs/{rid}"))["status"] not in ("finished", "failed"):
    time.sleep(1)
if run["status"] != "finished":
    sys.exit(f"FAIL run {run['status']}: {run.get('error')}")
kpi = call("GET", f"/projects/{pid}/runs/{rid}/report")["report"]["kpi"]
step("allocate", t, f"{kpi['allocated']} of {kpi['signals_total']} placed, {kpi['held_out']} held out")

t = time.time()
prev = call("POST", f"/projects/{pid}/intent", {"request": "Keep AIR and DOR on separate CIOCs"})
assert prev["state"] == "preview", prev
step("plain-English rule", t, f"{prev['rule_preview']['source']}: {prev['rule_preview']['rule']['name']}")

t = time.time()
groups = call("GET", f"/projects/{pid}/tq-groups")
for g in groups:
    print(f"      {g['priority']}  {g['title']}  ({g['signals']} signals, recommended: {g['recommended'] and g['recommended']['option']})")
step("triage", t, f"{len(groups)} groups")

t = time.time()
done = 0
for g in groups:
    rec = g["recommended"]
    if rec and g["open_ids"]:
        out = call("POST", f"/projects/{pid}/tqs/bulk-answer", {"tq_ids": g["open_ids"], "option": rec["option"], "scope": rec["scope"], "value": rec.get("value"), "author": "demo-smoke"})
        done += len(out["answered"])
step("apply recommendations", t, f"{done} answered")

t = time.time()
for kind in ("allocation", "tq"):
    doc = call("GET", f"/projects/{pid}/runs/{rid}/reports/{kind}")
    xlsx = call("GET", f"/projects/{pid}/runs/{rid}/reports/{kind}?format=xlsx", raw=True)
    assert xlsx[:2] == b"PK" and doc["sections"], kind
step("reports", t, "allocation and TQ documents and workbooks")
print("DEMO READY")
