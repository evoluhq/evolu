import { timingSafeEqual } from "node:crypto";
import type { TimingSafeEqual } from "@evolu/common";

export const createTimingSafeEqual = (): TimingSafeEqual => timingSafeEqual;
