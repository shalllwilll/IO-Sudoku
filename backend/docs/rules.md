# Rule reference

A rule is JSON:

```json
{"id": "R-X", "name": "...", "primitive": "separate", "scope": "io_type = AIR",
 "strength": "hard", "parameters": {"a": "...", "b": "...", "level": "cioc"}}
```

A rule needs a `primitive`, a `builtin`, or a `not_enforced_reason` explaining why it is only
documented. `strength` is `hard`, `soft` or `advisory`; only `hard` rules are enforced.

## Primitives

| Primitive | Parameters | Meaning |
|---|---|---|
| `co_locate` | `by`, `level` | signals sharing the `by` field value sit in the same unit at `level` |
| `separate` | `a`, `b`, `level` | signals matching scope `a` and scope `b` never share a unit at `level` |
| `capacity` | `per`, `max`, `measure` | at most `max` per unit (default measure: channels/positions) |
| `reserve` | `baseplate`, `cioc_seq` | keep a baseplate of a CIOC free of field signals (alarm/spare) |
| `quota` | `per`, `max_percent` | at most a percentage of a unit |
| `order` | `by`, `direction` | placement order along a unit |
| `assign` | `cabinet` / `cioc` / `cioc_seq` / `baseplates` | force a scope into a given unit |
| `pin` | `cioc`, `baseplate`, `channel` | fix a scope to an exact slot |
| `limit_span` | `unit`, `max` | a cable block spans at most `max` units |

Levels are `baseplate`, `cioc`, `cabinet`.

## Scope language

`field = X`, `field != X`, `field in [a, b]`, combined with `and`, `or`, `not` and
parentheses. Scopes are parsed, never evaluated as code. An empty scope means all signals.

## Builtins

`R-BLOCK` keeps a cable's signals contiguous; `R-RESERVE` applies the spare floor
(10%, rounded down) and the alarm baseplate.

## Presets

`plant-default`: A/B segregation never share a CIOC, 12 channels per baseplate, 96 positions
per CIOC, contiguous cable blocks, alarm baseplate and spare reserve. `strict` adds
`STRICT-LOGIC` (co-locate by logic number).

## Lint and dry run

`POST /projects/{pid}/lint` returns findings (unknown fields, contradictory rules, rules that
match nothing) and, optionally, a dry run showing how many signals each rule touches.
`POST /rules/compile` (AI) turns a plain-English request into a rule preview;
`/rules/compile/confirm` saves it. `/rules/mine` proposes rules from an issued allocation.
