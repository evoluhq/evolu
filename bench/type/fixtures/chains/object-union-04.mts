import { literal, object, union } from "./api.mts";
import { NumberFromString } from "./number-from-string.mts";
import { objectUnionMembers02 } from "./object-union-02.mts";

const O3 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O3"),
  value: NumberFromString,
});

const O4 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O4"),
  value: NumberFromString,
});

export const objectUnionMembers04 = [
  ...objectUnionMembers02,
  O3,
  O4,
] as const;

export const OU4 = /*#__PURE__*/ union(...objectUnionMembers04);
