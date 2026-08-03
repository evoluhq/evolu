import { literal, union } from "./api.mts";
import { unionMembers16 } from "./union-16.mts";

export const unionMembers32 = [
  ...unionMembers16,
  /*#__PURE__*/ literal("V17"),
  /*#__PURE__*/ literal("V18"),
  /*#__PURE__*/ literal("V19"),
  /*#__PURE__*/ literal("V20"),
  /*#__PURE__*/ literal("V21"),
  /*#__PURE__*/ literal("V22"),
  /*#__PURE__*/ literal("V23"),
  /*#__PURE__*/ literal("V24"),
  /*#__PURE__*/ literal("V25"),
  /*#__PURE__*/ literal("V26"),
  /*#__PURE__*/ literal("V27"),
  /*#__PURE__*/ literal("V28"),
  /*#__PURE__*/ literal("V29"),
  /*#__PURE__*/ literal("V30"),
  /*#__PURE__*/ literal("V31"),
  /*#__PURE__*/ literal("V32"),
] as const;

export const U32 = /*#__PURE__*/ union(...unionMembers32);
