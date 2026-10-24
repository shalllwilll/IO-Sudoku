import { useEffect, useRef } from "react";

// A soft light that follows the pointer. It writes two CSS variables from requestAnimationFrame,
// so React never re-renders per move. Disabled under prefers-reduced-motion.
export default function PointerGlow({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    function onMove(event) {
      if (frame) return;
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        node.style.setProperty("--gx", `${clientX - box.left}px`);
        node.style.setProperty("--gy", `${clientY - box.top}px`);
        node.style.setProperty("--go", "1");
      });
    }
    function onLeave() {
      node.style.setProperty("--go", "0");
    }
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-testid="pointer-glow"
      className={`bg-graphite ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(420px circle at var(--gx, 50%) var(--gy, 50%), rgba(215,218,223,0.10), transparent 70%)",
        opacity: "calc(0.4 + 0.6 * var(--go, 0))",
      }}
    />
  );
}
