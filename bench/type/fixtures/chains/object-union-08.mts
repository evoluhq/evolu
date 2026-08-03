import { literal, object, union } from "./api.mts";
import { NumberFromString } from "./number-from-string.mts";
import { objectUnionMembers04 } from "./object-union-04.mts";

const O5 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O5"),
  value: NumberFromString,
});

const O6 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O6"),
  value: NumberFromString,
});

const O7 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O7"),
  value: NumberFromString,
});

const O8 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O8"),
  value: NumberFromString,
});

export const objectUnionMembers08 = [
  ...objectUnionMembers04,
  O5,
  O6,
  O7,
  O8,
] as const;

export const OU8 = /*#__PURE__*/ union(...objectUnionMembers08);
