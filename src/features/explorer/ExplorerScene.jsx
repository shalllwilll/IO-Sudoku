import { Edges, Html, Line, OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CatmullRomCurve3, Color, Object3D, Vector3 } from "three";
import { combinedBounds, createGeometry, logicalRoute, OVERVIEW_POSITION_LIMIT } from "./geometry.js";
import { STATUS } from "./model.js";
import EquipmentContext from "./EquipmentContext.jsx";
import { nodeIo, slotIndicator } from "./IoPresentation.jsx";
import { recordIo } from "./ioTypes.js";
import { slotBrightness } from "./allocationPlayback.js";
import { nodeLabel } from "./displayNames.js";

function CameraController({ geometry, request, locked, reducedMotion }) {
  const controls = useRef(null);
  const transition = useRef(null);
  const lastRequest = useRef(null);
  const { camera, size } = useThree();
  useEffect(() => {
    if (lastRequest.current === request.serial) return;
    lastRequest.current = request.serial;
    const bounds = combinedBounds(geometry, request.ids);
    const centre = new Vector3(...bounds.position);
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(bounds.size[1] / 2, bounds.size[0] / (2 * aspect), 0.45) / Math.tan(camera.fov * Math.PI / 360) * 1.45 + bounds.size[2] / 2;
    transition.current = { from: camera.position.clone(), to: centre.clone().add(new Vector3(distance * 0.12, distance * 0.12, distance)), fromTarget: controls.current?.target.clone() ?? new Vector3(), toTarget: centre, elapsed: 0 };
  }, [geometry, request, camera, size.width, size.height]);
  useFrame((_state, delta) => {
    const move = transition.current;
    if (!move || !controls.current) return;
    move.elapsed += Math.min(delta, 0.1);
    const fraction = reducedMotion ? 1 : Math.min(1, move.elapsed / 0.7);
    const t = fraction * fraction * (3 - 2 * fraction);
    camera.position.lerpVectors(move.from, move.to, t);
    controls.current.target.lerpVectors(move.fromTarget, move.toTarget, t);
    controls.current.update();
    if (fraction === 1) transition.current = null;
  });
  return <OrbitControls ref={controls} makeDefault enabled={!locked} enableDamping dampingFactor={0.12} minDistance={0.18} maxDistance={600} maxPolarAngle={Math.PI * 0.94} onStart={() => { transition.current = null; }} />;
}

function EquipmentLabel({ node, position, selected, onSelect, dataset, onHover, matching, presenting }) {
  const wrapper = useRef(null);
  const world = useMemo(() => new Vector3(...position), [position]);
  const info = node.type === "position" ? nodeIo(node, dataset) : null;
  useFrame(({ camera }) => {
    if (wrapper.current) wrapper.current.style.opacity = String((matching ? 1 : 0.22) * (selected ? 1 : Math.max(0.4, Math.min(1, 28 / Math.max(1, camera.position.distanceTo(world))))));
  });
  return <Html position={position} center zIndexRange={[15, 0]}><div ref={wrapper}>
    <button type="button" className={`explorer-world-label ${selected ? "is-selected" : ""} ${presenting ? "is-presenting" : ""}`} aria-label={info ? `${node.label}: ${info.code} — ${info.name}` : undefined} onClick={(event) => { event.stopPropagation(); onSelect(node.id); }} onPointerEnter={() => { if (info) onHover(node.id); }} onPointerMove={(event) => { event.stopPropagation(); if (info) onHover(node.id); }} onPointerLeave={() => { if (info) onHover(null); }} onFocus={() => { if (info) onHover(node.id); }} onBlur={() => { if (info) onHover(null); }}>
      <span>{info ? `${node.channel} · ${info.code === "UNKNOWN" ? "?" : info.code === "SPARE" ? "SP" : info.code}` : nodeLabel(node)}</span>{node.display && <span className="block text-[9px] text-soft-white/70">{node.label}</span>}{node.summary.issues > 0 && <span className="ml-1" style={{ color: STATUS[node.status].color }}>!</span>}
      {node.type === "cabinet" && <span className="block text-[9px] text-soft-white/80">{node.summary.signals} signals · {node.summary.spares} spares</span>}
    </button>
  </div></Html>;
}

function PositionInstances({ positions, geometry, dataset, visibleIds, filteredOnly, onSelect, onHover, reveal }) {
  const mesh = useRef(null);
  const previous = useRef({ revealed: -1, running: false });
  const shown = useMemo(() => positions.filter((node) => !filteredOnly || node.recordIds.some((id) => visibleIds.has(id))), [positions, filteredOnly, visibleIds]);
  const instances = useMemo(() => new Map(shown.map((node, index) => [node.id, index])), [shown]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    shown.forEach((node, index) => {
      const shape = geometry.get(node.id);
      transform.position.set(...shape.position);
      transform.scale.set(...shape.size);
      transform.updateMatrix();
      mesh.current.setMatrixAt(index, transform.matrix);
      const color = new Color(nodeIo(node, dataset).color);
      color.multiplyScalar(slotBrightness(node, dataset, visibleIds, reveal));
      mesh.current.setColorAt(index, color);
    });
    mesh.current.count = shown.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    previous.current = { revealed: reveal?.current.revealed ?? 0, running: reveal?.current.running ?? false };
  }, [shown, geometry, dataset, visibleIds, reveal]);
  useFrame(() => {
    if (!mesh.current || !reveal) return;
    const frame = reveal.current, last = previous.current;
    if (frame.revealed === last.revealed && frame.running === last.running) return;
    const repaint = (node, index) => mesh.current.setColorAt(index, new Color(nodeIo(node, dataset).color).multiplyScalar(slotBrightness(node, dataset, visibleIds, reveal)));
    if (frame.running !== last.running || frame.revealed < last.revealed) shown.forEach(repaint);
    else for (let rank = Math.max(0, last.revealed); rank < frame.revealed; rank++) {
      const id = reveal.timeline.entries[rank]?.nodeId, index = instances.get(id);
      if (index !== undefined) repaint(dataset.nodes.get(id), index);
    }
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    previous.current = { revealed: frame.revealed, running: frame.running };
  });
  return <instancedMesh ref={mesh} args={[null, null, Math.max(1, positions.length)]}
    onClick={(event) => { event.stopPropagation(); const node = shown[event.instanceId]; if (node) onSelect(node.id); }}
    onPointerMove={(event) => { if (event.nativeEvent.target.closest?.(".explorer-world-label")) return; event.stopPropagation(); onHover(shown[event.instanceId]?.id ?? null); }} onPointerOut={(event) => { if (!event.nativeEvent.target.closest?.(".explorer-world-label")) onHover(null); }}>
    <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial toneMapped={false} />
  </instancedMesh>;
}

function PositionIndicators({ positions, geometry, dataset, visibleIds, filteredOnly, selectedIds }) {
  const mesh = useRef(null);
  const strips = useMemo(() => {
    const parts = [];
    for (const node of positions) {
      if (filteredOnly && !node.recordIds.some((id) => visibleIds.has(id))) continue;
      const alert = slotIndicator(node, dataset);
      const rings = [...(alert ? [{ color: alert.color, margin: 0.025 }] : []), ...(node.recordIds.some((id) => selectedIds.has(id)) ? [{ color: "#ffffff", margin: 0.09 }] : [])];
      const shape = geometry.get(node.id), [x, y, z] = shape.position;
      for (const ring of rings) {
        const width = shape.size[0] + ring.margin, height = shape.size[1] + ring.margin;
        const matching = node.io?.code === "SPARE" || node.recordIds.some((id) => visibleIds.has(id));
        const color = new Color(ring.color).multiplyScalar(matching ? 1 : 0.12);
        for (const [offset, size] of [[[-width / 2, 0], [0.022, height, 0.018]], [[width / 2, 0], [0.022, height, 0.018]], [[0, -height / 2], [width, 0.022, 0.018]], [[0, height / 2], [width, 0.022, 0.018]]]) parts.push({ position: [x + offset[0], y + offset[1], z + shape.size[2] / 2 + 0.02], size, color });
      }
    }
    return parts;
  }, [positions, geometry, dataset, visibleIds, filteredOnly, selectedIds]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    strips.forEach((part, index) => { transform.position.set(...part.position); transform.scale.set(...part.size); transform.updateMatrix(); mesh.current.setMatrixAt(index, transform.matrix); mesh.current.setColorAt(index, new Color(part.color)); });
    mesh.current.count = strips.length; mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [strips]);
  return <instancedMesh ref={mesh} args={[null, null, Math.max(1, positions.length * 8)]} raycast={() => null}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>;
}

function HardwareInstances({ dataset, geometry, visibleIds, filteredOnly, focusCabinet, focusCioc, onSelect }) {
  const mesh = useRef(null);
  const shapes = useMemo(() => {
    const list = [];
    for (const node of dataset.nodes.values()) {
      if (filteredOnly && !node.recordIds.some((id) => visibleIds.has(id))) continue;
      if (node.type === "baseplate") {
        const cioc = dataset.nodes.get(node.parentId);
        if (dataset.counts.positions > 4096 && focusCioc && cioc.id !== focusCioc) continue;
        if (dataset.counts.positions > 4096 && focusCabinet && cioc.parentId !== focusCabinet) continue;
        if (!focusCabinet && dataset.counts.positions > 4096) continue;
      }
      const shape = geometry.get(node.id);
      if (node.type === "cabinet") {
        const [w, h, d] = shape.size;
        const parts = [[[0, 0, -d / 2], [w, h, 0.16]], [[-w / 2, 0, 0], [0.16, h, d]], [[w / 2, 0, 0], [0.16, h, d]], [[0, h / 2, 0], [w, 0.16, d]], [[0, -h / 2, 0], [w, 0.16, d]]];
        for (const [offset, size] of parts) list.push({ id: node.id, position: shape.position.map((value, axis) => value + offset[axis]), size, color: "#384352" });
      } else if (["cioc", "baseplate"].includes(node.type)) list.push({ id: node.id, ...shape, color: node.type === "cioc" ? "#293847" : "#485363" });
    }
    return list;
  }, [dataset, geometry, visibleIds, filteredOnly, focusCabinet, focusCioc]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    shapes.forEach((shape, index) => {
      transform.position.set(...shape.position); transform.scale.set(...shape.size); transform.updateMatrix();
      mesh.current.setMatrixAt(index, transform.matrix); mesh.current.setColorAt(index, new Color(shape.color));
    });
    mesh.current.count = shapes.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [shapes]);
  const capacity = dataset.nodes.size + dataset.root.childIds.length * 5;
  return <instancedMesh ref={mesh} args={[null, null, Math.max(1, capacity)]} onClick={(event) => { event.stopPropagation(); const shape = shapes[event.instanceId]; if (shape) onSelect(shape.id); }}><boxGeometry args={[1, 1, 1]} /><meshLambertMaterial /></instancedMesh>;
}

function SignalPaths({ dataset, geometry, recordIds, playback, reducedMotion, onComplete }) {
  const paths = useMemo(() => recordIds.slice(0, 12).map((id, index) => {
    const record = dataset.recordMap.get(id);
    const route = record && logicalRoute(geometry, dataset, record, index);
    if (!route) return null;
    const curve = new CatmullRomCurve3(route.map((point) => new Vector3(...point)), false, "centripetal");
    const info = recordIo(record);
    return { record, info, curve, points: curve.getPoints(80) };
  }).filter(Boolean), [recordIds, geometry, dataset]);
  const pulses = useRef([]);
  const elapsed = useRef(0);
  const completed = useRef(false);
  useEffect(() => { elapsed.current = 0; completed.current = false; }, [recordIds, playback.generation]);
  useFrame((_state, delta) => {
    if (playback.mode !== "playing" || reducedMotion) return;
    elapsed.current += Math.min(delta, 0.1);
    const progress = Math.min(1, elapsed.current / 5);
    paths.forEach((path, index) => { if (path.info.code !== "UNKNOWN") pulses.current[index]?.position.copy(path.curve.getPoint(progress)); });
    if (progress === 1 && !completed.current) { completed.current = true; onComplete(); }
  });
  if (playback.mode === "off") return null;
  return paths.map((path, index) => <group key={path.record.id}>
    <Line points={path.points} color={path.info.color} lineWidth={1.6} transparent opacity={0.8} />
    <mesh ref={(node) => { pulses.current[index] = node; }} position={path.points[0]} visible={!reducedMotion && playback.mode !== "stopped" && path.info.code !== "UNKNOWN"}>
      <sphereGeometry args={[0.11, 10, 8]} /><meshBasicMaterial color="#ffffff" />
    </mesh>
    <Html position={path.points[["AO", "DO"].includes(path.info.code) ? path.points.length - 1 : 0]} center zIndexRange={[10, 0]}><span className="explorer-world-label">{path.record.tag || "Unlabelled signal"} · {path.record.kind === "cabinet alarm" ? "internal cabinet source" : "logical field endpoint"}{path.info.code === "UNKNOWN" ? " · direction unknown" : ""}</span></Html>
  </group>);
}

function FrameStats({ onStats }) {
  const sample = useRef({ frames: 0, elapsed: 0 });
  useFrame((_state, delta) => {
    if (delta > 0.5) return;
    sample.current.frames++; sample.current.elapsed += delta;
    if (sample.current.elapsed >= 2) {
      onStats(Math.round(sample.current.frames / sample.current.elapsed));
      sample.current = { frames: 0, elapsed: 0 };
    }
  });
  return null;
}

function RevealHighlights({ reveal, geometry }) {
  const mesh = useRef(null);
  const previous = useRef(-1);
  useFrame(() => {
    if (!mesh.current || !reveal) return;
    const frame = reveal.current;
    if (!frame.running || frame.phase !== "filling") { mesh.current.count = 0; return; }
    if (previous.current === frame.revealed) return;
    previous.current = frame.revealed;
    const transform = new Object3D(); let count = 0;
    for (let index = Math.max(frame.batchStart, frame.revealed - 256); index < frame.revealed; index++) {
      const shape = geometry.get(reveal.timeline.entries[index]?.nodeId);
      if (!shape) continue;
      const [x, y, z] = shape.position, w = shape.size[0] + 0.045, h = shape.size[1] + 0.045;
      for (const [offset, size] of [[[-w / 2, 0], [0.025, h, 0.02]], [[w / 2, 0], [0.025, h, 0.02]], [[0, -h / 2], [w, 0.025, 0.02]], [[0, h / 2], [w, 0.025, 0.02]]]) {
        transform.position.set(x + offset[0], y + offset[1], z + shape.size[2] / 2 + 0.045); transform.scale.set(...size); transform.updateMatrix(); mesh.current.setMatrixAt(count++, transform.matrix);
      }
    }
    mesh.current.count = count; mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere();
  });
  return <instancedMesh ref={mesh} args={[null, null, 1024]} raycast={() => null}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#e6f5ff" toneMapped={false} /></instancedMesh>;
}

export default memo(function ExplorerScene({ dataset, selectedNodeId, focusRequest, visibleIds, selectedIds, filteredOnly, locked, reducedMotion, playback, animationIds, onComplete, onSelect, onStats, onHover, reveal, activeCabinetId, showContext = false }) {
  const geometry = useMemo(() => createGeometry(dataset, { includeContext: showContext }), [dataset, showContext]);
  const scope = useMemo(() => {
    const chain = [];
    for (let node = dataset.nodes.get(selectedNodeId); node; node = dataset.nodes.get(node.parentId)) chain.push(node);
    return { cabinet: chain.find((node) => node.type === "cabinet")?.id, cioc: chain.find((node) => node.type === "cioc")?.id, baseplate: chain.find((node) => node.type === "baseplate")?.id };
  }, [dataset, selectedNodeId]);
  const positions = useMemo(() => {
    const animated = new Set(animationIds.map((id) => dataset.recordMap.get(id)?.nodeId));
    return [...dataset.nodes.values()].filter((node) => {
      if (node.type !== "position") return false;
      if (dataset.counts.positions <= 4096) return true;
      if (activeCabinetId && dataset.nodes.get(dataset.nodes.get(node.parentId).parentId).parentId === activeCabinetId) return true;
      if (animated.has(node.id) || node.recordIds.some((id) => selectedIds.has(id))) return true;
      const plate = dataset.nodes.get(node.parentId), cioc = dataset.nodes.get(plate.parentId);
      if (scope.baseplate) return plate.id === scope.baseplate;
      if (scope.cioc) return cioc.id === scope.cioc;
      if (scope.cabinet) return cioc.parentId === scope.cabinet;
      return dataset.counts.positions <= OVERVIEW_POSITION_LIMIT;
    });
  }, [dataset, scope, animationIds, selectedIds, activeCabinetId]);
  const selectedNode = dataset.nodes.get(selectedNodeId);
  const selectedShape = geometry.get(selectedNodeId);
  const contextual = selectedNode ? [selectedNode, ...selectedNode.childIds.map((id) => dataset.nodes.get(id))] : [];
  const labelNodes = [...new Map([...dataset.root.childIds.map((id) => dataset.nodes.get(id)), ...contextual].map((node) => [node.id, node])).values()].filter((node) => node.type !== "overview");
  return <>
    <CameraController geometry={geometry} request={focusRequest} locked={locked} reducedMotion={reducedMotion} />
    <ambientLight intensity={1.2} /><directionalLight position={[12, 18, 20]} intensity={2.2} /><directionalLight position={[-15, 7, 2]} intensity={0.7} />
    <gridHelper args={[Math.max(60, geometry.get("overview").size[0] * 1.6), 60, "#343e4b", "#252b34"]} position={[0, -0.2, 0]} />
    {showContext && <EquipmentContext dataset={dataset} geometry={geometry} visibleIds={visibleIds} filteredOnly={filteredOnly} />}
    <HardwareInstances dataset={dataset} geometry={geometry} visibleIds={visibleIds} filteredOnly={filteredOnly} focusCabinet={scope.cabinet} focusCioc={scope.cioc} onSelect={onSelect} />
    <PositionInstances positions={positions} geometry={geometry} dataset={dataset} visibleIds={visibleIds} filteredOnly={filteredOnly} onSelect={onSelect} onHover={onHover} reveal={reveal} />
    <PositionIndicators positions={positions} geometry={geometry} dataset={dataset} visibleIds={visibleIds} selectedIds={selectedIds} filteredOnly={filteredOnly} />
    <RevealHighlights reveal={reveal} geometry={geometry} />
    {activeCabinetId && geometry.has(activeCabinetId) && <mesh position={geometry.get(activeCabinetId).position} raycast={() => null}><boxGeometry args={geometry.get(activeCabinetId).size.map((value) => value + 0.12)} /><meshBasicMaterial visible={false} /><Edges color="#bfe4ff" /></mesh>}
    {selectedShape && selectedNodeId !== "overview" && <mesh position={selectedShape.position} raycast={() => null}>
      <boxGeometry args={selectedShape.size.map((value) => value + 0.08)} /><meshBasicMaterial visible={false} /><Edges color="#ffffff" scale={1.01} />
    </mesh>}
    {labelNodes.filter((node) => !filteredOnly || node.recordIds.some((id) => visibleIds.has(id))).map((node) => {
      const shape = geometry.get(node.id);
      const matching = node.type !== "position" || node.io?.code === "SPARE" || node.recordIds.some((id) => visibleIds.has(id));
      return <EquipmentLabel key={node.id} node={node} dataset={dataset} onHover={onHover} matching={matching} presenting={node.id === activeCabinetId} position={[shape.position[0], shape.position[1] + shape.size[1] / 2 + 0.26, shape.position[2] + 1]} selected={node.id === selectedNodeId} onSelect={onSelect} />;
    })}
    <SignalPaths dataset={dataset} geometry={geometry} recordIds={animationIds} playback={playback} reducedMotion={reducedMotion} onComplete={onComplete} />
    <FrameStats onStats={onStats} />
  </>;
});
