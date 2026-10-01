import type { TimingSafeEqual } from "@evolu/common";
import { timingSafeEqual } from "node:crypto";

/** Creates the Node.js implementation of {@link TimingSafeEqual}. */
export const createTimingSafeEqual = (): TimingSafeEqual => (a, b) =>
  // Node throws for different lengths; the contract returns false.
  a.length === b.length && timingSafeEqual(a, b);
