import {
  createType,
  literal,
  ok,
  union,
} from "./api.mts";
import { mixedUnionMembers16 } from "./mixed-union-16.mts";

const V17 = /*#__PURE__*/ createType(
  "V17",
  /*#__PURE__*/ literal("V17"),
  (value) => ok(value),
);
const V19 = /*#__PURE__*/ createType(
  "V19",
  /*#__PURE__*/ literal("V19"),
  (value) => ok(value),
);
const V21 = /*#__PURE__*/ createType(
  "V21",
  /*#__PURE__*/ literal("V21"),
  (value) => ok(value),
);
const V23 = /*#__PURE__*/ createType(
  "V23",
  /*#__PURE__*/ literal("V23"),
  (value) => ok(value),
);
const V25 = /*#__PURE__*/ createType(
  "V25",
  /*#__PURE__*/ literal("V25"),
  (value) => ok(value),
);
const V27 = /*#__PURE__*/ createType(
  "V27",
  /*#__PURE__*/ literal("V27"),
  (value) => ok(value),
);
const V29 = /*#__PURE__*/ createType(
  "V29",
  /*#__PURE__*/ literal("V29"),
  (value) => ok(value),
);
const V31 = /*#__PURE__*/ createType(
  "V31",
  /*#__PURE__*/ literal("V31"),
  (value) => ok(value),
);

export const mixedUnionMembers32 = [
  ...mixedUnionMembers16,
  V17,
  "V18",
  V19,
  "V20",
  V21,
  "V22",
  V23,
  "V24",
  V25,
  "V26",
  V27,
  "V28",
  V29,
  "V30",
  V31,
  "V32",
] as const;

export const MU32 = /*#__PURE__*/ union(...mixedUnionMembers32);
