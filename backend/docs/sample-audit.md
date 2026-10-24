# Sample allocation audit

Run the aggregate-only comparison locally with:

```bash
cd backend
SUDOKU_DATA_DIR=data .venv/bin/python scripts/audit_sample.py
```

The script reads the MDB and supplied reference allocation but prints only counts and rates. Do
not commit either workbook or its row-level output.

## Current regression floor

The Phase 6 baseline requires at least 176 of 177 reference field cable/pairs to reconcile, all
12 cabinet-alarm tags to reconcile, and at least 19 of 22 comparable wired-spare hardware rows to
match. These are lower bounds: an improvement is accepted; a regression fails the test.

The current comparison also makes remaining engineering work visible rather than disguising it:
the generated layout has fewer allocation rows than the reference because ownership-aware planning
creates two cabinets while the reference has three, and the default `declared_pairs` policy still
installs more wired spares than the reference. A confirmed project wiring plan can use
`explicit_pairs` plus `wired_spare_hardware` to resolve that difference without guessing.
