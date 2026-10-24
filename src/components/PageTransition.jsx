import { useEffect, useRef, useState } from "react";

let firstPaint = true;

/** Reads --t-page in ms (0 under reduced motion). */
export function pageDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--t-page").trim();
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

// Fades and slides its children in using opacity and transform only.
// Skipped on the very first paint of the app. Optionally moves focus to the first heading.
export default function PageTransition({ children, focusHeading = false }) {
  const ref = useRef(null);
  const [skip] = useState(() => firstPaint);

  useEffect(() => {
    firstPaint = false;
    if (focusHeading) {
      const heading = ref.current?.querySelector("h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
  }, [focusHeading]);

  return (
    <div ref={ref} className={skip ? "" : "page-enter"}>
      {children}
    </div>
  );
}
