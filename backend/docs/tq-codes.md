# Technical query (TQ) codes

TQs are how the engine asks instead of guessing. Each has a severity (`blocking`, `assumed`,
`info`), the category the problem statement uses, a subject, a message, answer options with
stated consequences, and the default applied if unanswered. Answer with
`POST /projects/{pid}/tqs/{tid}/answer`; answers are stored with author and scope
(`row`, `cable`, `everywhere`) and a rerun reuses unaffected stages.

| Code | Category | Raised when |
|---|---|---|
| `TQ-DATA` | missing data | a row has missing/contradictory data (e.g. tag and cable area numbers differ) |
| `TQ-MAP` | missing data | a required column cannot be matched confidently |
| `TQ-VALUE` | missing data | an IO type, duty class or segregation code is not known |
| `TQ-HW` | missing data | the hardware part for a signal is not known |
| `TQ-NAME` | missing data | a name part needed for generated names is missing |
| `TQ-SEG` | rule conflicts | a cable mixes segregation families that must be separated |
| `TQ-RULE` | rule conflicts | a hard rule makes a signal unplaceable |
| `TQ-REV` | rule conflicts | a revision wants to move a signal that a rule pins |
| `TQ-CAP` | capacity issues | no room is left for a block or signal |
| `TQ-SPARE` | capacity issues | the spare allowance cannot be met |
| `TQ-ALM` | capacity issues | no alarm baseplate has room for an alarm signal |

Options per code are defined in `app/core/tq/model.py`. `GET /tqs/{tid}/explain` returns an AI
wording of a TQ when Gemini is configured; the TQ itself is unchanged.
