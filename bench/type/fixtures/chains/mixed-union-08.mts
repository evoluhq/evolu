import {
  createType,
  literal,
  ok,
  union,
} from "./api.mts";
import { mixedUnionMembers04 } from "./mixed-union-04.mts";

const V5 = /*#__PURE__*/ createType(
  "V5",
  /*#__PURE__*/ literal("V5"),
  (value) => ok(value),
);
const V7 = /*#__PURE__*/ createType(
  "V7",
  /*#__PURE__*/ literal("V7"),
  (value) => ok(value),
);

export const mixedUnionMembers08 = [
  ...mixedUnionMembers04,
  V5,
  "V6",
  V7,
  "V8",
] as const;

export const MU8 = /*#__PURE__*/ union(...mixedUnionMembers08);
