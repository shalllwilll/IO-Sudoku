# 3D plant view: integration contract

For the teammate building the 3D model. The system UI mounts the scene and owns all data fetching; the scene only renders and reports interaction. Build against this and integration is a drop-in.

## Mount point
Route `/projects/:pid/runs/:rid/plant` (currently a placeholder, `src/pages/Plant.tsx`). The scene is a default-exported React component, loaded with `React.lazy` so three.js stays out of the main bundle.

```ts
interface SlotRef { cioc_no: number; baseplate: number; channel: number }

interface PlantSceneProps {
  layout: Layout            // GET /api/projects/{pid}/runs/{rid}/layout  (LayoutOut.layout)
  placements: Placement[]   // GET .../allocation  (AllocationOut.placements)
  tqs: TQ[]                 // GET .../tqs
  selected: SlotRef | null  // owned by the host so 2D and 3D stay in step
  ioFilter: 'AIR' | 'AOR' | 'DIR' | 'DOR' | null
  theme: 'dark' | 'light'
  reducedMotion: boolean
  onSelect(slot: SlotRef | null): void
  onHover?(slot: SlotRef | null): void
}
```
Types are the backend's, generated from `backend/docs/openapi.json` (the host app exports them). Do not fetch data inside the scene.

## Behaviour expected
- Hierarchy: plant, controller, cabinet, CIOC, baseplate, 12 CHARM channels. Read counts from `layout`; never hardcode (4 CIOCs per cabinet, 8 baseplates per CIOC, 12 channels per baseplate are confirmed; CIOCs per controller is not).
- Camera states plant / controller / cabinet / slot. Selecting a slot in 2D (`selected` changes) should move the camera there; clicking a slot in 3D calls `onSelect`.
- Slot kinds (`Placement.kind`): `field`, `wired_spare`, `spare_slot`, `cabinet_alarm`. Reserved baseplates come from `Baseplate.reserved` (`alarm`, `spare`). Colour by `io_type` with the same palette as the UI (`--io-air`, `--io-aor`, `--io-dir`, `--io-dor`); kind must also differ by shape or texture, not colour alone.
- TQ markers: a TQ lists `signal_keys` as `file:row`; match them to placements through `Placement.signal.source_file` and `source_row`. TQs without a placed signal (held out) have no slot and are not drawn.
- Honour `reducedMotion` (no camera flights, no ambient motion) and `theme`.
- Size: up to 1,152 positions per three-cabinet plant, more for larger projects. Instance meshes; measure frame rate on a laptop GPU.

## Development
Develop against saved copies of the three responses above. With the backend running and a finished run, capture them:

```bash
B=http://localhost:8000/api/projects/<pid>/runs/<rid>
curl -s $B/layout > layout.json; curl -s $B/allocation > allocation.json; curl -s $B/tqs > tqs.json
```

Keep these out of git if they come from real plant data. The scene must also run standalone, without the host app.
