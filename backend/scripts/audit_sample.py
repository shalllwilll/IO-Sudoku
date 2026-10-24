"""Generate an allocation and print aggregate comparison metrics against a reference workbook.

Usage:
    SUDOKU_DATA_DIR=data python scripts/audit_sample.py
"""

import json
import os
from pathlib import Path

from app.core.audit import compare_reference
from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.solve.greedy import solve_greedy


def _sample(folder: Path, needle: str) -> Path:
    hits = sorted(p for p in folder.glob(f"*{needle}*.xlsx") if "sample" in p.name.lower())
    if not hits:
        raise SystemExit(f"no {needle} workbook found in {folder}")
    return hits[0]


def main() -> None:
    folder = Path(os.environ.get("SUDOKU_DATA_DIR", "data"))
    mdb, reference = _sample(folder, "MDB"), _sample(folder, "Allocation")
    pack = Pack.load("packs/default")
    signals = merge_files([mdb], pack).signals
    alloc = solve_greedy(build_blocks(signals, pack), pack, "P30", "32001")
    print(
        json.dumps(compare_reference(alloc, pack, reference).model_dump(), indent=2, sort_keys=True)
    )


if __name__ == "__main__":
    main()
