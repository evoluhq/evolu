import { union } from "./api.mts";
import { literalUnionValues16 } from "./literal-union-16.mts";

export const literalUnionValues32 = [
  ...literalUnionValues16,
  "V17",
  "V18",
  "V19",
  "V20",
  "V21",
  "V22",
  "V23",
  "V24",
  "V25",
  "V26",
  "V27",
  "V28",
  "V29",
  "V30",
  "V31",
  "V32",
] as const;

export const LU32 = /*#__PURE__*/ union(...literalUnionValues32);
