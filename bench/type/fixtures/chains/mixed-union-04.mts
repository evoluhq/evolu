import {
  createType,
  literal,
  ok,
  union,
} from "./api.mts";
import { mixedUnionMembers02 } from "./mixed-union-02.mts";

const V3 = /*#__PURE__*/ createType(
  "V3",
  /*#__PURE__*/ literal("V3"),
  (value) => ok(value),
);

export const mixedUnionMembers04 = [
  ...mixedUnionMembers02,
  V3,
  "V4",
] as const;

export const MU4 = /*#__PURE__*/ union(...mixedUnionMembers04);
