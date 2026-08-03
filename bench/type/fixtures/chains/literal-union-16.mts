import { union } from "./api.mts";
import { literalUnionValues08 } from "./literal-union-08.mts";

export const literalUnionValues16 = [
  ...literalUnionValues08,
  "V9",
  "V10",
  "V11",
  "V12",
  "V13",
  "V14",
  "V15",
  "V16",
] as const;

export const LU16 = /*#__PURE__*/ union(...literalUnionValues16);
