import { literal, union } from "./api.mts";

export const unionMembers02 = [
  /*#__PURE__*/ literal("V1"),
  /*#__PURE__*/ literal("V2"),
] as const;

export const U2 = /*#__PURE__*/ union(...unionMembers02);
