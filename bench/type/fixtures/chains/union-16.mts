import { literal, union } from "./api.mts";
import { unionMembers08 } from "./union-08.mts";

export const unionMembers16 = [
  ...unionMembers08,
  /*#__PURE__*/ literal("V9"),
  /*#__PURE__*/ literal("V10"),
  /*#__PURE__*/ literal("V11"),
  /*#__PURE__*/ literal("V12"),
  /*#__PURE__*/ literal("V13"),
  /*#__PURE__*/ literal("V14"),
  /*#__PURE__*/ literal("V15"),
  /*#__PURE__*/ literal("V16"),
] as const;

export const U16 = /*#__PURE__*/ union(...unionMembers16);
