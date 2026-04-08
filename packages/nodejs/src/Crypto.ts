import type { TimingSafeEqual } from "@evolu/common";
import { timingSafeEqual } from "node:crypto";

/** Creates the Node.js implementation of {@link TimingSafeEqual}. */
export const createTimingSafeEqual = (): TimingSafeEqual => timingSafeEqual;
