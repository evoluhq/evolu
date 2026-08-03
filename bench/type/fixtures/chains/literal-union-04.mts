import { union } from "./api.mts";
import { literalUnionValues02 } from "./literal-union-02.mts";

export const literalUnionValues04 = [
  ...literalUnionValues02,
  "V3",
  "V4",
] as const;

export const LU4 = /*#__PURE__*/ union(...literalUnionValues04);
