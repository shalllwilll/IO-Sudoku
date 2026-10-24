// Computes WCAG 2.1 contrast for soft-white text on each chrome background.
// Exits non-zero when any pair falls below 4.5:1 (normal text).
import config from "../tailwind.config.js";

const colors = config.theme.extend.colors;
const text = colors["soft-white"];
const backgrounds = { graphite: colors.graphite, carbon: colors.carbon, gunmetal: colors.gunmetal };

function luminance(hex) {
  const channel = (i) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failed = false;
for (const [name, bg] of Object.entries(backgrounds)) {
  const ratio = contrast(text, bg);
  const pass = ratio >= 4.5;
  if (!pass) failed = true;
  console.log(`${pass ? "PASS" : "FAIL"} soft-white on ${name}: ${ratio.toFixed(2)}:1`);
}
process.exit(failed ? 1 : 0);
