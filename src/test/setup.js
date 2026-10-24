import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  try {
    sessionStorage.clear();
  } catch {
    /* storage may be unavailable */
  }
});
