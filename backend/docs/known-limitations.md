# Known limitations

- **Relay output hardware.** The terminal-block part for relay outputs is not in the
  hackathon material; those rows ship with an empty part and a `TQ-HW`.
- **CIOCs per controller (16)** is an unconfirmed parameter in `packs/default/capacity.json`.
- **AI.** Free-tier Gemini only, subject to its limits. The primary model
  (`gemini-3.8-flash`) did not respond for the development key, so the fallback
  (`gemini-3.5-flash-lite`) is what ran. The Google SDK is not used; requests go over HTTPS
  with httpx. Without a key all AI features are off and everything else works.
- **CP-SAT** does not model `pin` or `order` natively; the validator enforces them afterwards.
- **QIGA** skips instances above 400 blocks and decoding is slow at about 30 blocks. A QPSO
  variant was cheaper in the benchmark ([benchmark.md](benchmark.md)); swapping is an open item.
- **Revisions** never grow the layout (no new cabinets). Answers to `TQ-REV` and note answers
  have no pipeline effect yet. Revision solves and the rule miner were not measured at 10,000
  signals.
- **Scope.** MCC and IRC rows in the hackathon data are out of scope by design.
- **Security.** No authentication; intended for a trusted plant network or local use.
- **Wired spares are assumed, not read.** The MDB does not say which unused cable pairs are
  physically wired. The default `required_spares` policy promotes just enough declared unused
  pairs to meet the 10%-per-IO-type-per-controller rule and raises a `TQ-SPARE` for the engineer
  to confirm; a real wiring plan (`explicit_pairs`) overrides it. The per-controller grouping
  depends on `ciocs_per_controller` (16), which no supplied document confirms. The guidelines
  document does confirm 4 CIOCs per cabinet, 8 baseplates per CIOC and 12 channels per baseplate.
