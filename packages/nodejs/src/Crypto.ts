import type { TimingSafeEqual } from "@evolu/common";
import { timingSafeEqual } from "node:crypto";

export const createTimingSafeEqual = (): TimingSafeEqual => timingSafeEqual;
