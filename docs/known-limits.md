# Known limits before release

- **Live backend integration is incomplete.** `src/api/live/index.js` remains a stub. The backend contract and authentication mechanism must be finalized before implementing the live adapter or claiming an end-to-end live flow.
- The sign-in screen enforces the configured email domain, but the current mock sign-in is local and does not authenticate a real identity. No password should be treated as verified in mock mode.
- No backend endpoints exist for chat, preferences, cancellation, or named rule sets. Chat uses the FAQ fallback, cancellation is local, and rule sets are stored in the current tab's session storage.
- Mapping semantics and some TQ answer details remain contract gaps documented in `contract-gaps.md`.
- Client upload checks are not a security boundary; the backend must validate uploads.
- Mobile layouts display a larger-screen notice, but the full flow is designed for laptop/tablet-sized displays.
- The 3D bundle remains large before gzip and 3D frame rate has not been measured on the demo laptop.
- Automated axe scans, keyboard-only end-to-end coverage, offline rehearsal twice, production hosting/SPA fallback, and live CORS/auth validation remain pending.
- Release tag `v0.1.0-frontend` has not been created because the playbook requires team agreement first.
