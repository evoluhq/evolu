import { literal, union } from "./api.mts";
import { unionMembers02 } from "./union-02.mts";

export const unionMembers04 = [
  ...unionMembers02,
  /*#__PURE__*/ literal("V3"),
  /*#__PURE__*/ literal("V4"),
] as const;

export const U4 = /*#__PURE__*/ union(...unionMembers04);
