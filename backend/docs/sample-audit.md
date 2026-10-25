# Sample allocation audit

Run the aggregate-only comparison locally with:

```bash
cd backend
SUDOKU_DATA_DIR=data .venv/bin/python scripts/audit_sample.py
```

The script reads the MDB and supplied reference allocation but prints only counts and rates. Do
not commit either workbook or its row-level output.

## Current regression floor

The raw greedy audit (`tests/test_audit.py`) requires at least 176 of 177 reference field
cable/pairs to reconcile and all 12 cabinet-alarm tags to reconcile, and claims no wired-spare
CHARM/TB match, because the greedy solver does not decide which unused pairs are wired.

Through the full chain with the default `required_spares` policy the sample gets 17 wired
spares (AIR 7, AOR 2, DIR 4, DOR 4: the 10% requirement), no validator violations and no spare
shortfall; 7 of the 8 pairs that coincide with the reference match its CHARM/TB hardware. The
reference itself wires 22, so the engine meets the rule rather than copying that count. The
reference-guided run (`tests/test_reference.py`) uses the confirmed 22 wired spares from the
approved workbook and requires all 22 to be retained. These are lower bounds: an improvement is
accepted; a regression fails the test.

The generated layout has fewer allocation rows than the reference (768 against 1152) because
ownership-aware planning creates two cabinets while the reference has three. A confirmed
project wiring plan, supplied as `explicit_pairs` plus `wired_spare_hardware`, replaces the
assumed spares with the real ones.
