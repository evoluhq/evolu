import {
  createType,
  literal,
  ok,
  union,
} from "./api.mts";

const V1 = /*#__PURE__*/ createType(
  "V1",
  /*#__PURE__*/ literal("V1"),
  (value) => ok(value),
);

export const mixedUnionMembers02 = [
  V1,
  "V2",
] as const;

export const MU2 = /*#__PURE__*/ union(...mixedUnionMembers02);
