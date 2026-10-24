import openpyxl

from app.core.hardware.engine import resolve_hardware
from app.core.ingest.merge import merge_files
from app.core.model.pack import Pack

CELLS = [
    ("CHARM Type", "charm"),
    ("Charm Description", "charm_name"),
    ("CHARM TB Part No", "tb"),
    ("CHARM TB Description", "tb_name"),
    ("HW Loop Typical", "loop_typical"),
]


def test_hardware_matches_sample_allocation(pack_dir, sample_mdb_path, sample_alloc_path):
    pack = Pack.load(pack_dir)
    ss = merge_files([sample_mdb_path], pack)
    by_tag = {}
    for s in ss.signals:
        by_tag[s.tag] = s
    for s in ss.signals:  # renamed tags: the allocation may still carry the old tag
        if s.old_tag:
            by_tag.setdefault(s.old_tag, s)

    by_place = {(s.cable, s.pair): s for s in ss.signals if s.pair is not None}

    ws = openpyxl.load_workbook(sample_alloc_path, read_only=True, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    head = rows[0]
    checked = ok = 0
    mismatches = []
    for r in rows[1:]:
        a = dict(zip(head, r, strict=False))
        if a.get("Tag Status") not in ("Field", "Cabinet Alarm"):
            continue
        # the sample allocation carries one stale tag; cable + pair is the stable identity
        s = by_tag.get(a["Tag Name"]) or by_place.get(
            (a["Field Cable No"], int(str(a["Field Cable Pair"]).split()[-1]))
        )
        if s is None:
            continue
        checked += 1
        res = resolve_hardware(s, pack)
        bad = [
            f"{col}: expected {a[col]!r}, got {getattr(res, attr)!r}"
            for col, attr in CELLS
            if str(a[col]) != str(getattr(res, attr) or "-")
        ]
        terms = [str(a[c]) for c in ("CHARM TB1", "CHARM TB2", "CHARM TB3")]
        if terms != res.tb_terminals:
            bad.append(f"TB1-3: expected {terms}, got {res.tb_terminals}")
        if bad:
            mismatches.append((a["Tag Name"], bad))
        else:
            ok += 1
    print(f"hardware golden: {ok}/{checked}")
    assert not mismatches, mismatches[:5]
    assert checked == 189 and ok == 189
