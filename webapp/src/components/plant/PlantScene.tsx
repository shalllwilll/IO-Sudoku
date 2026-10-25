import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, PerspectiveCamera, Vector3, type InstancedMesh } from 'three'
import type { LayoutData } from '@/api/queries'
import { buildPlantModel, slotHasTq } from '@/lib/plant'
import type { Slot } from '@/lib/results'

const IO_COLOUR: Record<string, string> = { AIR: '#56b4e9', AOR: '#2ec4a0', DIR: '#e69f00', DOR: '#e8743b' }
const KIND_COLOUR: Record<Slot['kind'], string> = { field: '#87939d', wired_spare: '#74d3c4', spare_slot: '#65727e', cabinet_alarm: '#d3dce4', empty: '#28313a' }

function colour(slot: Slot, highlighted: boolean) {
  if (highlighted) return '#ff7a67'
  if (slot.kind === 'field' && slot.io) return IO_COLOUR[slot.io] ?? KIND_COLOUR.field
  return KIND_COLOUR[slot.kind]
}

function CameraFit({ bounds, focusCabinet, fitKey, reducedMotion }: { bounds: { position: [number, number, number]; size: [number, number, number] }; focusCabinet?: { position: [number, number, number]; size: [number, number, number] }; fitKey: number; reducedMotion: boolean }) {
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null)
  const { camera, size } = useThree()
  const target = focusCabinet ?? bounds
  const moving = useRef<{ from: Vector3; to: Vector3; target: Vector3; elapsed: number } | null>(null)
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const fov = (camera as PerspectiveCamera).fov
    const distance = Math.max(target.size[1] / 2, target.size[0] / (2 * aspect)) / Math.tan((fov * Math.PI) / 360) * 1.45 + target.size[2] * 1.4
    const to = new Vector3(target.position[0] + distance * 0.17, target.position[1] + distance * 0.12, target.position[2] + distance)
    const centre = new Vector3(...target.position)
    if (reducedMotion) {
      camera.position.copy(to)
      controls.current?.target.copy(centre)
      controls.current?.update()
      moving.current = null
    } else moving.current = { from: camera.position.clone(), to, target: centre, elapsed: 0 }
  }, [camera, fitKey, reducedMotion, size.height, size.width, target])
  useFrame((_state, delta) => {
    const next = moving.current
    if (!next || !controls.current) return
    next.elapsed += Math.min(delta, 0.1)
    const progress = Math.min(1, next.elapsed / 0.3)
    const eased = progress * progress * (3 - 2 * progress)
    camera.position.lerpVectors(next.from, next.to, eased)
    controls.current.target.lerp(next.target, eased)
    controls.current.update()
    if (progress === 1) moving.current = null
  })
  return <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={0.1} maxPolarAngle={Math.PI * 0.92} minDistance={3} maxDistance={200} />
}

function CabinetFrames({ shapes }: { shapes: ReturnType<typeof buildPlantModel>['cabinets'] }) {
  return <>{shapes.map((shape) => <mesh key={shape.id} position={shape.position}><boxGeometry args={shape.size} /><meshStandardMaterial color="#344250" transparent opacity={0.2} roughness={0.8} metalness={0.1} wireframe /></mesh>)}</>
}

function Hardware({ ciocs, baseplates }: Pick<ReturnType<typeof buildPlantModel>, 'ciocs' | 'baseplates'>) {
  return <>
    {ciocs.map((shape) => <mesh key={shape.id} position={shape.position}><boxGeometry args={shape.size} /><meshStandardMaterial color="#202c36" transparent opacity={0.36} roughness={0.85} /></mesh>)}
    {baseplates.map((shape) => <mesh key={shape.id} position={shape.position}><boxGeometry args={shape.size} /><meshStandardMaterial color="#617488" roughness={0.72} metalness={0.12} /></mesh>)}
  </>
}

function CharmInstances({ slots, tqKeys, selected, onSelect }: { slots: ReturnType<typeof buildPlantModel>['slots']; tqKeys: Set<string>; selected?: Slot; onSelect: (slot: Slot) => void }) {
  const mesh = useRef<InstancedMesh>(null)
  const temp = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    if (!mesh.current) return
    slots.forEach((entry, index) => {
      temp.position.set(...entry.position)
      temp.scale.set(...entry.size)
      temp.updateMatrix()
      mesh.current?.setMatrixAt(index, temp.matrix)
      mesh.current?.setColorAt(index, new Color(colour(entry.slot, slotHasTq(entry.slot, tqKeys))))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [slots, temp, tqKeys])
  const selectedEntry = selected && slots.find((entry) => entry.slot === selected)
  return <>
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, slots.length)]} onClick={(event) => { event.stopPropagation(); const entry = slots[event.instanceId ?? -1]; if (entry) onSelect(entry.slot) }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.45} metalness={0.15} vertexColors />
    </instancedMesh>
    {selectedEntry && <mesh position={[selectedEntry.position[0], selectedEntry.position[1], selectedEntry.position[2] + 0.13]}><boxGeometry args={[selectedEntry.size[0] + 0.06, selectedEntry.size[1] + 0.06, 0.05]} /><meshBasicMaterial color="#ffffff" wireframe /></mesh>}
  </>
}

function SiteContext({ bounds }: { bounds: ReturnType<typeof buildPlantModel>['bounds'] }) {
  const left = -bounds.size[0] / 2 + 2
  const right = bounds.size[0] / 2 - 2
  return <>
    <mesh position={[left, 0.7, 0]}><boxGeometry args={[2.3, 1.2, 2]} /><meshStandardMaterial color="#256269" roughness={0.9} /></mesh>
    <mesh position={[right, 0.85, 0]}><boxGeometry args={[2.4, 1.5, 2.2]} /><meshStandardMaterial color="#384352" roughness={0.9} /></mesh>
  </>
}

export interface PlantSceneProps {
  layout: LayoutData['layout']
  slots: Slot[]
  tqKeys: Set<string>
  selected?: Slot
  focusCabinet?: number
  fitKey: number
  reducedMotion: boolean
  onSelect: (slot: Slot) => void
}

/** The extracted, data-driven 3D cabinet presentation. It makes no allocation decisions. */
export function PlantScene({ layout, slots, tqKeys, selected, focusCabinet, fitKey, reducedMotion, onSelect }: PlantSceneProps) {
  const model = useMemo(() => buildPlantModel(layout, slots), [layout, slots])
  const focus = focusCabinet === undefined ? undefined : model.cabinets.find((shape) => shape.id === `cabinet:${focusCabinet}`)
  return <Canvas aria-label="Interactive 3D allocation schematic" camera={{ fov: 38, near: 0.1, far: 500, position: [12, 8, 18] }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }} onPointerMissed={() => undefined}>
    <color attach="background" args={['#11181f']} />
    <ambientLight intensity={1.2} />
    <directionalLight position={[8, 12, 10]} intensity={1.8} />
    <pointLight position={[-8, 5, 6]} intensity={0.7} color="#6dd7dd" />
    <SiteContext bounds={model.bounds} />
    <CabinetFrames shapes={model.cabinets} />
    <Hardware ciocs={model.ciocs} baseplates={model.baseplates} />
    <CharmInstances slots={model.slots} tqKeys={tqKeys} selected={selected} onSelect={onSelect} />
    <CameraFit bounds={model.bounds} focusCabinet={focus} fitKey={fitKey} reducedMotion={reducedMotion} />
  </Canvas>
}
