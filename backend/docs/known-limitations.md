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
