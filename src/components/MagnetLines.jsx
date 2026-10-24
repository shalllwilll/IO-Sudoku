import { useEffect, useRef } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A lightweight, canvas-based magnetic line field for decorative backgrounds. */
export default function MagnetLines({
  className = "",
  lineColor = "#efefef",
  spacing = 30,
  lineWidth = 2,
  lineHeight = 18,
  mode = "orbit",
  shape = "line",
  radius = 200,
  fade = 0.65,
  baseAngle = -10,
  edgeFade = 0,
  stretch = 0.4,
  reach = 0,
  scatter = 0,
  inertia = 0.35,
  bounce = 0.3,
  ripple = 0.3,
  rainbow = false,
  tiltX = 0,
  tiltY = 0,
  clickPulse = false,
  intro = false,
  idle = false,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (typeof window.CanvasRenderingContext2D === "undefined") return undefined;
    const context = canvas?.getContext("2d");
    if (!canvas || !host || !context) return undefined;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const field = {
      width: 0,
      height: 0,
      pixelRatio: 1,
      pointer: { x: 0, y: 0, tx: 0, ty: 0, inside: false },
      pulse: null,
      startedAt: performance.now(),
      lastTime: performance.now(),
      idlePhase: 0,
    };
    let frame = 0;

    function resize() {
      const bounds = host.getBoundingClientRect();
      field.width = bounds.width;
      field.height = bounds.height;
      field.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(field.width * field.pixelRatio);
      canvas.height = Math.round(field.height * field.pixelRatio);
      canvas.style.width = `${field.width}px`;
      canvas.style.height = `${field.height}px`;
      requestDraw();
    }

    function draw(now) {
      frame = 0;
      const dt = Math.min((now - field.lastTime) / 1000, 0.05);
      field.lastTime = now;
      const { width, height, pixelRatio, pointer } = field;
      if (!width || !height) return;

      const ease = reducedMotion ? 1 : 1 - Math.pow(1 - clamp(inertia, 0.01, 1), dt * 60);
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      if (idle && !reducedMotion && !pointer.inside) field.idlePhase += dt * 0.45;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const introProgress = intro && !reducedMotion ? clamp((now - field.startedAt) / 850, 0, 1) : 1;
      const introScale = 1 - Math.pow(1 - introProgress, 3);
      const step = Math.max(8, spacing);
      const reachRadius = Math.max(1, radius + reach);
      const baseRadians = (baseAngle * Math.PI) / 180;
      const rowCount = Math.ceil(height / step) + 1;
      const columnCount = Math.ceil(width / step) + 1;
      const pulseAge = field.pulse ? now - field.pulse.startedAt : Infinity;
      const pulseRadius = pulseAge * 0.42;
      let index = 0;

      for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
          const seed = Math.sin((row + 1) * 127.1 + (column + 1) * 311.7) * 43758.5453;
          const noise = (seed - Math.floor(seed)) * 2 - 1;
          const x = column * step + step / 2 + noise * scatter;
          const y = row * step + step / 2 + noise * scatter;
          const dx = pointer.x - x;
          const dy = pointer.y - y;
          const distance = Math.hypot(dx, dy);
          const proximity = pointer.inside ? clamp(1 - distance / reachRadius, 0, 1) : 0;
          const influence = Math.pow(proximity, 1 + Math.max(0, fade) * 2);
          const pointerAngle = Math.atan2(dy, dx);
          const orbitAngle = pointerAngle + Math.PI / 2;
          const desiredAngle = mode === "orbit" ? orbitAngle : pointerAngle;
          const angleDelta = wrapAngle(desiredAngle - baseRadians);
          const angle = baseRadians + angleDelta * influence * clamp(stretch * 1.6, 0, 1);
          const drift = idle && !reducedMotion ? Math.sin(field.idlePhase + index * 0.017) * 1.5 : 0;
          const pull = influence * stretch * 18 + drift;
          const centerX = x + Math.cos(pointerAngle) * pull;
          const centerY = y + Math.sin(pointerAngle) * pull;
          const pulseStrength = field.pulse && pulseAge < 950
            ? Math.max(0, 1 - Math.abs(distance - pulseRadius) / 24) * ripple
            : 0;
          const normalX = -Math.sin(angle);
          const normalY = Math.cos(angle);
          const length = Math.max(0, lineHeight * introScale * (1 + bounce * pulseStrength));
          const half = length / 2;

          let alpha = 0.34 + influence * 0.12;
          if (edgeFade > 0) {
            const edgeDistance = Math.min(x, y, width - x, height - y);
            alpha *= clamp(edgeDistance / (step * edgeFade * 3), 0, 1);
          }
          context.globalAlpha = alpha * introProgress;
          context.strokeStyle = rainbow ? `hsl(${(now / 35 + index * 7) % 360} 78% 70%)` : lineColor;
          context.lineWidth = lineWidth;
          context.lineCap = shape === "dot" ? "round" : "butt";
          context.beginPath();
          if (shape === "dot") {
            context.arc(centerX, centerY, Math.max(1, lineWidth * 0.8), 0, Math.PI * 2);
          } else {
            context.moveTo(centerX - normalX * half, centerY - normalY * half);
            context.lineTo(centerX + normalX * half, centerY + normalY * half);
          }
          context.stroke();
          index += 1;
        }
      }
      context.globalAlpha = 1;

      const pointerSettling = Math.abs(pointer.tx - pointer.x) > 0.15 || Math.abs(pointer.ty - pointer.y) > 0.15;
      if ((!reducedMotion && introProgress < 1) || pointerSettling || (field.pulse && pulseAge < 950) || (idle && !reducedMotion && !pointer.inside)) {
        frame = requestAnimationFrame(draw);
      } else {
        field.pulse = null;
      }
    }

    function requestDraw() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function onPointerMove(event) {
      const bounds = canvas.getBoundingClientRect();
      field.pointer.tx = event.clientX - bounds.left;
      field.pointer.ty = event.clientY - bounds.top;
      field.pointer.inside = true;
      requestDraw();
    }

    function onPointerLeave() {
      field.pointer.inside = false;
      field.pointer.tx = field.pointer.x;
      field.pointer.ty = field.pointer.y;
      requestDraw();
    }

    function onPointerDown(event) {
      if (!clickPulse) return;
      const bounds = canvas.getBoundingClientRect();
      field.pulse = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, startedAt: performance.now() };
      field.pointer.tx = field.pulse.x;
      field.pointer.ty = field.pulse.y;
      field.pointer.inside = true;
      requestDraw();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerDown);
    resize();

    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    baseAngle,
    bounce,
    clickPulse,
    edgeFade,
    fade,
    inertia,
    intro,
    idle,
    lineColor,
    lineHeight,
    lineWidth,
    mode,
    radius,
    reach,
    rainbow,
    ripple,
    scatter,
    shape,
    spacing,
    stretch,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-auto block ${className}`}
      aria-hidden="true"
      style={{
        opacity: 0.52,
        maskImage: "radial-gradient(ellipse at center, #000 28%, rgb(0 0 0 / 72%) 62%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, #000 28%, rgb(0 0 0 / 72%) 62%, transparent 100%)",
        transform: `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
      }}
    />
  );
}
