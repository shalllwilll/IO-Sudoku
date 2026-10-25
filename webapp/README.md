# IO Signal Sudoku: system UI

React 19, Vite, TypeScript (strict), Tailwind v4, Motion, TanStack Query, zustand. Types are generated from `../backend/docs/openapi.json`. Design decisions: `docs/design-spec.md`. 3D handoff: `docs/plant-contract.md`.

```bash
npm install
npm run dev -- --port 5180   # backend expected at http://localhost:8000
npm run typecheck && npm run lint && npm test && npm run build
```

The backend address defaults to `VITE_API_BASE` (else `http://localhost:8000`) and can be overridden per browser in Settings.

## Flow
Projects, then per project: Data, Map, Values, Rules, Run, Results (Overview, Allocation, Layout, TQs). Alongside: TQ inbox, Revisions, and the AI Assistant panel (needs AI configured on the backend; everything else works without it).

## Regenerating API types
```bash
npx openapi-typescript ../backend/docs/openapi.json -o src/api/schema.d.ts
```

## Known limits
- Sign-in is a demo with no access control; name and role stay on this device.
- "TQ answers since last run" is tracked in this browser, not on the server.
- Run events arrive as a burst after the pipeline; the Run screen paces the replay.
- The 3D plant route is a placeholder until the 3D scene is integrated.
- There is no browser end-to-end suite yet; behaviour is covered by component and library tests with a mocked API.
