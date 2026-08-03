import { literal, object, union } from "./api.mts";
import { NumberFromString } from "./number-from-string.mts";
import { objectUnionMembers08 } from "./object-union-08.mts";

const O9 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O9"),
  value: NumberFromString,
});

const O10 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O10"),
  value: NumberFromString,
});

const O11 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O11"),
  value: NumberFromString,
});

const O12 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O12"),
  value: NumberFromString,
});

const O13 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O13"),
  value: NumberFromString,
});

const O14 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O14"),
  value: NumberFromString,
});

const O15 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O15"),
  value: NumberFromString,
});

const O16 = /*#__PURE__*/ object({
  kind: /*#__PURE__*/ literal("O16"),
  value: NumberFromString,
});

export const objectUnionMembers16 = [
  ...objectUnionMembers08,
  O9,
  O10,
  O11,
  O12,
  O13,
  O14,
  O15,
  O16,
] as const;

export const OU16 = /*#__PURE__*/ union(...objectUnionMembers16);
