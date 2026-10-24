import os
from pathlib import Path

import pytest
from hypothesis import settings

# modest in CI; HYPOTHESIS_PROFILE=nightly (or pytest -m nightly) for the big sweep
settings.register_profile("ci", max_examples=40, deadline=None)
settings.register_profile("nightly", max_examples=1000, deadline=None)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "ci"))

PACK_DIR = Path(__file__).resolve().parent.parent / "packs" / "default"


def _data_file(name_hint: str, exclude: str = "\0") -> Path:
    d = os.environ.get("SUDOKU_DATA_DIR")
    if not d:
        pytest.skip("SUDOKU_DATA_DIR is not set; hackathon sample files are unavailable")
    matches = sorted(
        p
        for p in Path(d).glob("*.xlsx")
        if name_hint.lower() in p.name.lower() and exclude not in p.name.lower()
    )
    if not matches:
        pytest.skip(f"no '{name_hint}' workbook found in SUDOKU_DATA_DIR={d}")
    return matches[0]


@pytest.fixture
def pack_dir() -> Path:
    return PACK_DIR


@pytest.fixture
def sample_mdb_path() -> Path:
    return _data_file("mdb")


@pytest.fixture
def blank_template_path() -> Path:
    return _data_file("blank")


@pytest.fixture
def sample_alloc_path() -> Path:
    return _data_file("alloc", exclude="blank")
