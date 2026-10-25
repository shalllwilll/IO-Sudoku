# Known limits before release

- **Live backend integration is incomplete.** `src/api/live/index.js` remains a stub. The backend contract and authentication mechanism must be finalized before implementing the live adapter or claiming an end-to-end live flow.
- The sign-in screen enforces the configured email domain, but the current mock sign-in is local and does not authenticate a real identity. No password should be treated as verified in mock mode.
- No backend endpoints exist for chat, preferences, cancellation, or named rule sets. Chat uses the FAQ fallback, cancellation is local, and rule sets are stored in the current tab's session storage.
- Mapping semantics and some TQ answer details remain contract gaps documented in `contract-gaps.md`.
- Client upload checks are not a security boundary; the backend must validate uploads.
- Most application pages are designed for laptop/tablet-sized displays. The new allocation explorer stacks its browser, viewport, and inspector on smaller screens.
- The 3D and Excel parser bundles remain large before gzip, but are loaded only on the explorer/import path. Browser measurements are recorded in `performance.md`; frame rate still needs checking on the actual presentation laptop.
- Axe coverage exists for the landing, dashboard, history, and allocation explorer (including loaded and fallback data). Axe coverage for the other project pages, the complete keyboard-only allocation workflow, offline rehearsal twice, production hosting/SPA fallback, and live CORS/auth validation remain pending.
- The explorer is a schematic, read-only allocation inspector. It does not certify physical cabinet dimensions, surveyed cable routing, CHARM compatibility, or engineering validity in the absence of authoritative validation results. The sample workbook's occupied positions remain unverified.
- Release tag `v0.1.0-frontend` has not been created because the playbook requires team agreement first.
