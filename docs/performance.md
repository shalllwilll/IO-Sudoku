# Performance, responsive layout, and accessibility

## Current measurements

- `npm run build` reports the main JavaScript bundle at approximately 407 KB uncompressed / 126 KB gzip, below the 250 KB gzip budget.
- The plant stage is a separate lazy-loaded chunk (approximately 227 KB gzip in the current build). It is imported only by `/plant`.
- Vite warns that the 3D chunk exceeds 500 KB before gzip. Keep an eye on this when adding scene features; the lazy boundary prevents it from delaying the initial application route.
- No verified 1,152-position render profile or throttled-network first-load measurement is available yet. Capture these on the demo laptop before release.
- 30 fps on the plant view depends on the demo hardware and scene size; it has not been measured here.

## Responsive and accessibility behavior

- At widths below 768 px, signed-in pages and the plant view show a notice that the tool is designed for larger screens.
- Shared page transitions, the landing canvas, and 3D camera motion honor `prefers-reduced-motion`.
- Controls use visible keyboard focus; navigation, tabs, switches, errors, and the 3D ladder expose labels or roles. The 3D view also includes a DOM ladder and legend as a text alternative to the canvas.
- Run `npm run e2e` for browser smoke and axe-core checks on the landing, dashboard, history, and 3D pages; run `npm run check` for lint, unit tests, and build. The complete keyboard-only end-to-end flow remains pending.
- `npm run check-contrast` checks the base soft-white text against graphite, carbon, and gunmetal. Data-state color pairs also use glyphs or outlines; manually verify every data color against both graphite and black in the target browser.
