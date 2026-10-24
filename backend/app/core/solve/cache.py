"""Result cache keyed by everything that can change an allocation."""

import hashlib
import json
import platform
from pathlib import Path

import ortools

from app.core.layout.blocks import BlockSet
from app.core.model.allocation import Allocation

SOLVER_REVISION = "1"  # bump when the model or packer changes behaviour


def lib_versions() -> dict[str, str]:
    return {
        "ortools": ortools.__version__,
        "python": platform.python_version(),
        "solver": SOLVER_REVISION,
    }


def blocks_hash(blocks: BlockSet) -> str:
    return hashlib.sha256(blocks.model_dump_json().encode()).hexdigest()


def make_key(
    blocks: BlockSet,
    pack_hash: str,
    rules_hash: str,
    versions: dict[str, str] | None = None,
    **extra: object,
) -> str:
    """(signal-set hash, pack hash, rule hash, library versions) plus solver settings."""
    raw = json.dumps(
        {
            "signals": blocks_hash(blocks),
            "pack": pack_hash,
            "rules": rules_hash,
            "versions": versions if versions is not None else lib_versions(),
            "extra": extra,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(raw.encode()).hexdigest()


class ResultCache:
    """In memory, optionally mirrored to a folder so it survives a restart."""

    def __init__(self, folder: str | Path | None = None):
        self._mem: dict[str, str] = {}
        self.folder = Path(folder) if folder else None
        if self.folder:
            self.folder.mkdir(parents=True, exist_ok=True)

    def get(self, key: str) -> tuple[Allocation, list[dict]] | None:
        raw = self._mem.get(key)
        if raw is None and self.folder and (self.folder / f"{key}.json").exists():
            raw = (self.folder / f"{key}.json").read_text()
        if raw is None:
            return None
        try:
            data = json.loads(raw)
            return Allocation.model_validate(data["allocation"]), data["events"]
        except (ValueError, KeyError):
            return None  # a damaged entry is a miss, never an error

    def put(self, key: str, alloc: Allocation, events: list[dict]) -> None:
        raw = json.dumps({"allocation": json.loads(alloc.model_dump_json()), "events": events})
        self._mem[key] = raw
        if self.folder:
            (self.folder / f"{key}.json").write_text(raw)

    def __len__(self) -> int:
        return len(self._mem)
