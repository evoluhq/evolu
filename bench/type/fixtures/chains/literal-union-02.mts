import { union } from "./api.mts";

export const literalUnionValues02 = ["V1", "V2"] as const;

export const LU2 = /*#__PURE__*/ union(...literalUnionValues02);
