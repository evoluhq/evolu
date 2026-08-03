import { literal, object, union } from "./api.mts";
import { NumberFromString } from "./number-from-string.mts";

const O1 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O1"),
  value: NumberFromString,
});

const O2 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O2"),
  value: NumberFromString,
});

export const objectUnionMembers02 = [
  O1,
  O2,
] as const;

export const OU2 = /*#__PURE__*/ union(...objectUnionMembers02);
