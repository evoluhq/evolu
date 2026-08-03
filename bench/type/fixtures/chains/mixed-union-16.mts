import {
  createType,
  literal,
  ok,
  union,
} from "./api.mts";
import { mixedUnionMembers08 } from "./mixed-union-08.mts";

const V9 = /*#__PURE__*/ createType(
  "V9",
  /*#__PURE__*/ literal("V9"),
  (value) => ok(value),
);
const V11 = /*#__PURE__*/ createType(
  "V11",
  /*#__PURE__*/ literal("V11"),
  (value) => ok(value),
);
const V13 = /*#__PURE__*/ createType(
  "V13",
  /*#__PURE__*/ literal("V13"),
  (value) => ok(value),
);
const V15 = /*#__PURE__*/ createType(
  "V15",
  /*#__PURE__*/ literal("V15"),
  (value) => ok(value),
);

export const mixedUnionMembers16 = [
  ...mixedUnionMembers08,
  V9,
  "V10",
  V11,
  "V12",
  V13,
  "V14",
  V15,
  "V16",
] as const;

export const MU16 = /*#__PURE__*/ union(...mixedUnionMembers16);
