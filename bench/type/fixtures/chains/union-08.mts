import { literal, union } from "./api.mts";
import { unionMembers04 } from "./union-04.mts";

export const unionMembers08 = [
  ...unionMembers04,
  /*#__PURE__*/ literal("V5"),
  /*#__PURE__*/ literal("V6"),
  /*#__PURE__*/ literal("V7"),
  /*#__PURE__*/ literal("V8"),
] as const;

export const U8 = /*#__PURE__*/ union(...unionMembers08);
