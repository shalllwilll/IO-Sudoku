# Sample allocation audit

Run the aggregate-only comparison locally with:

```bash
cd backend
SUDOKU_DATA_DIR=data .venv/bin/python scripts/audit_sample.py
```

The script reads the MDB and supplied reference allocation but prints only counts and rates. Do
not commit either workbook or its row-level output.

## Current regression floor

With the default `explicit_pairs` policy the audit requires at least 176 of 177 reference field
cable/pairs to reconcile and all 12 cabinet-alarm tags to reconcile. It also requires that no
wired-spare CHARM/TB match is claimed, because the MDB does not identify which unused pairs were
physically wired. The reference-guided run (`tests/test_reference.py`) uses the confirmed 22
wired spares from the approved workbook and requires all 22 to be retained, with at least 6
matching hardware descriptors exactly. These are lower bounds: an improvement is accepted; a
regression fails the test.

The current comparison also makes remaining engineering work visible rather than disguising it:
the generated layout has fewer allocation rows than the reference (768 against 1152) because
ownership-aware planning creates two cabinets while the reference has three, and under the
default policy it reports no wired spares where the reference has 22. A confirmed project wiring
plan, supplied as `explicit_pairs` plus `wired_spare_hardware`, resolves the spare difference
without guessing.
