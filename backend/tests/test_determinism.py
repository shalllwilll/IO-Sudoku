import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.reports import build_report
from app.core.rules.sets import load_preset
from app.core.solve.chain import run_chain
from app.core.synth import synthetic_signals

BACKEND = Path(__file__).resolve().parent.parent
FAST = {"deterministic_time": 2.0}


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def fingerprint(blocks, pack, rules):
    res = run_chain(blocks, pack, "AR1", "100", rules, cpsat_enabled=True, **FAST)
    sigs = [s for b in blocks.blocks for s in b.signals]
    rep = build_report(res.allocation, pack, sigs, res.allocation.issues, rules=rules)
    return res.allocation.model_dump_json(), json.dumps(rep.sheets(), default=str, sort_keys=True)


def test_synthetic_run_twice_is_byte_identical(pack):
    blocks = build_blocks(synthetic_signals(150, seed=3), pack)
    rules = load_preset(pack).rules
    assert fingerprint(blocks, pack, rules) == fingerprint(blocks, pack, rules)


def test_sample_run_twice_is_byte_identical(pack, sample_mdb_path):
    blocks = build_blocks(merge_files([sample_mdb_path], pack).signals, pack)
    rules = load_preset(pack).rules
    a, b = fingerprint(blocks, pack, rules), fingerprint(blocks, pack, rules)
    assert a == b


SCRIPT = """
import hashlib, json
from pathlib import Path
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.rules.sets import load_preset
from app.core.solve.chain import run_chain
from app.core.synth import synthetic_signals
pack = Pack.load(Path('packs/default'))
blocks = build_blocks(synthetic_signals(120, seed=5), pack)
res = run_chain(blocks, pack, 'AR1', '100', load_preset(pack).rules, cpsat_enabled=True, deterministic_time=2.0)
print(hashlib.sha256(res.allocation.model_dump_json().encode()).hexdigest())
"""


def test_result_does_not_depend_on_hash_randomisation():
    out = set()
    for seed in ("0", "17", "4242"):
        env = {**os.environ, "PYTHONHASHSEED": seed}
        r = subprocess.run(
            [sys.executable, "-c", SCRIPT],
            check=False,
            cwd=BACKEND,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert r.returncode == 0, r.stderr
        out.add(r.stdout.strip())
    assert len(out) == 1 and len(next(iter(out))) == 64
    assert hashlib.sha256(b"").hexdigest() not in out
