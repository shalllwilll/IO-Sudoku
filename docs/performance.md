# Performance, responsive layout, and accessibility

## Current measurements

- `npm run build` reports the main JavaScript bundle at approximately 408 KB uncompressed / 127 KB gzip, below the 250 KB gzip budget.
- The explorer is a separate lazy-loaded chunk (approximately 247 KB gzip after the I/O-color update). It is imported only by `/plant`.
- The ExcelJS browser reader is a separate worker dependency (approximately 932 KB before gzip / 256 KB gzip). It is fetched only when importing a workbook. Parsing runs off the UI thread.
- Vite warns that the 3D and parser chunks exceed 500 KB before gzip. These chunks do not load on unrelated application pages.
- A throttled-network initial application load and the original 2D grid's render budget have not been measured by this change.

### Explorer measurements

Before the simplified Run workflow, the desktop Chromium tests produced the following measurements. These historical local-asset measurements are not a network-throttled benchmark or a guarantee on other GPUs. The current normal-size view renders all positions up to 4,096, so its GPU workload differs from the older aggregated overview below. Its 6.5-second reveal uses batched instance updates; no new frame-rate guarantee is claimed.

| Case | Result |
|---|---|
| Supplied allocation workbook | 1,152 source rows and unique positions, 189 active signals, 963 spare records, zero silently dropped rows. |
| Workbook selection to visible canvas | 1,084 ms. |
| Workbook parsing in worker | 457 ms. |
| Sample model normalization | 17 ms. |
| Sample overview | 60 fps, using aggregated hardware at overview level. Detailed positions appear when equipment is selected. |
| Synthetic 11,520-record import, filter, and position selection | 2,608 ms total; 18 ms CSV parse; 160 ms model normalization; 59 fps in the focused view. |

Repeated runs varied with the execution environment and warm caches: earlier sample parsing was about 1.1 seconds, and an earlier larger focused view measured 47 fps. Frame-rate observations remain available as viewport metadata. Full-detail rendering of all 11,520 positions at once was slow in the initial implementation; above 4,096 positions the current viewer uses instancing and selection/presentation-based detail instead.

The separate local Node benchmark measured normalization/geometry/filter times of 82/3.4/1.1 ms for 1,152 records and 518/13.4/1.4 ms for 11,520 records. After five dataset-model switches and explicit GC, the observed retained heap difference was about 1 MB. This is an approximate JS heap observation, not proof of browser/GPU memory behavior. Run `scripts/profile-explorer.mjs` to repeat it with a local workbook.

## Responsive and accessibility behavior

- The explorer is checked at 1280, 1024, 768, and 390 px for page-level horizontal overflow. Decorative side diagrams shrink first; the existing inspector remains separately scrollable. Application-shell pages retain their larger-screen notice.
- Shared page transitions, the landing canvas, and 3D camera motion honor `prefers-reduced-motion`. The explorer uses instant focus and skips the allocation reveal and decorative pulses under reduced motion.
- Controls use visible keyboard focus; navigation, tabs, switches, errors, and the 3D ladder expose labels or roles. The 3D view also includes a DOM ladder and legend as a text alternative to the canvas.
- Current verification covers automatic Excel worker import, four-cabinet sequential reveal timing, global combined filters and dimming, hierarchy/issue navigation, conflict/unplaced handling, camera persistence during and after playback, dataset switching, malformed input, reduced motion, responsive widths, keyboard inspection, axe checks, and pixel checks of all four I/O colors from the supplied workbook. The pure-logic suite contains 192 tests. The earlier large-data measurements above are historical; the current end-to-end workflow suite does not rerun that benchmark. The complete keyboard-only allocation workflow outside the explorer remains pending.
- `npm run check-contrast` checks the base soft-white text against graphite, carbon, and gunmetal. Data-state color pairs also use glyphs or outlines; manually verify every data color against both graphite and black in the target browser.
