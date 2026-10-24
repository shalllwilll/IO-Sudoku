# Security and privacy notes

## Checks completed

- `npm audit --omit=dev` reports no production dependency vulnerabilities after upgrading Zod to v4.6.7.
- Full-history Gitleaks scan of the `frontend` branch found no secrets in the scanned 20 commits.
- Built asset search found no `AIza`, `sk-`, or `api_key` strings and no source maps.
- No workbook or CSV dataset files are tracked. The source has no `dangerouslySetInnerHTML` use.
- Session state stores only the email in `sessionStorage`; no access token is stored in browser storage. The backend has no auth endpoint/cookie contract yet.
- `index.html` supplies a restrictive CSP. `connect-src` allows same-origin requests, Vite's local HMR websocket, and the configured API origin. Inline styles are allowed for the existing style props; inline scripts are not.
- Upload validation is a client-side convenience only: extensions, size (25 MB by default), and basic file signatures are checked. The server must independently validate file type, size, and contents.
- Chat requests are built from redacted summaries by `src/features/chat/buildRunContext.js`; live network confirmation is pending a real backend/auth integration.

## Findings and limits

- The full development dependency tree retains five moderate audit findings in the Tailwind/PostCSS selector-parser and ExcelJS/uuid dependency chains. Fixes currently require major dependency changes; no high or critical development findings remain. Revisit with compatible upstream releases.
- The historical initial commit has a co-author trailer. Published history was not rewritten; new commits follow the playbook's clean trailer policy.
- CSP should also be configured as an HTTP response header by the eventual hosting platform. A meta policy cannot provide `frame-ancestors` protection.
- Live upload enforcement, session transport, CSRF behavior, production CORS, and live chat redaction need verification with backend owners before release.
- Never put credentials, private backend URLs, or secrets in `VITE_*` variables or committed files. Keep `.env` local and ignored.
