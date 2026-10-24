"""Drive a running backend end to end: project, upload, run, results, workbook.

    uvicorn app.main:app &                      # in another terminal
    python scripts/demo.py [mdb.xlsx] [--base http://localhost:8000] [--area P30 --unit 32001]

Without a file it uses the sample MDB in the data folder (SUDOKU_DATA_DIR or ./data).
"""

import argparse
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent


def sample() -> Path | None:
    data = Path(os.environ.get("SUDOKU_DATA_DIR") or ROOT / "data")
    found = sorted(data.glob("*MDB*.xlsx")) if data.is_dir() else []
    return found[0] if found else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", nargs="?")
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--area", default="AR1")
    ap.add_argument("--unit", default="100")
    ap.add_argument("--out", default="demo_allocation.xlsx")
    args = ap.parse_args()
    path = Path(args.file) if args.file else sample()
    if path is None or not path.is_file():
        print("no MDB workbook: pass a path or put the sample in the data folder", file=sys.stderr)
        return 2
    c = httpx.Client(base_url=args.base, timeout=120)
    try:
        c.get("/api/health").raise_for_status()
    except httpx.HTTPError as e:
        print(f"backend not reachable at {args.base}: {e}", file=sys.stderr)
        return 2

    def ok(r: httpx.Response) -> dict:
        if r.status_code >= 400:
            sys.exit(f"{r.request.method} {r.request.url.path} -> {r.status_code} {r.text[:300]}")
        return r.json()

    pid = ok(c.post("/api/projects", json={"name": "demo", "area": args.area, "unit": args.unit}))[
        "id"
    ]
    up = ok(c.post(f"/api/projects/{pid}/uploads", files={"file": (path.name, path.read_bytes())}))
    print(f"uploaded {up['name']}: {sum(s['rows'] for s in up['sheets'])} rows")
    run = ok(c.post(f"/api/projects/{pid}/runs", json={}))
    t0 = time.time()
    while run["status"] == "running":
        time.sleep(0.5)
        run = ok(c.get(f"/api/projects/{pid}/runs/{run['id']}"))
    print(f"run {run['status']} in {time.time() - t0:.1f}s: {run['summary']}")
    if run["status"] != "finished":
        print(run.get("error"), file=sys.stderr)
        return 1
    base = f"/api/projects/{pid}/runs/{run['id']}"
    alloc = ok(c.get(f"{base}/allocation"))
    print(
        f"solver {alloc['solver']}: {len(alloc['placements'])} placed, {len(alloc['unplaced'])} unplaced"
    )
    tqs = ok(c.get(f"{base}/tqs"))
    print(f"{len(tqs)} technical queries")
    for t in tqs[:5]:
        print(f"  {t['code']}: {t.get('message', '')[:100]}")
    rep = ok(c.get(f"{base}/report"))["report"]
    print("rules passed:", sum(1 for r in rep["rules"] if r["passed"]), "of", len(rep["rules"]))
    d = c.get(f"{base}/download")
    if d.status_code == 200:
        Path(args.out).write_bytes(d.content)
        print(f"workbook written to {args.out} ({len(d.content)} bytes)")
    else:
        print(f"no workbook: {d.status_code} {d.text[:200]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
