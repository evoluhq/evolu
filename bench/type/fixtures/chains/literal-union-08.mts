import { union } from "./api.mts";
import { literalUnionValues04 } from "./literal-union-04.mts";

export const literalUnionValues08 = [
  ...literalUnionValues04,
  "V5",
  "V6",
  "V7",
  "V8",
] as const;

export const LU8 = /*#__PURE__*/ union(...literalUnionValues08);
