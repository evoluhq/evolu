import { discriminatedUnion } from "./api.mts";
import { objectUnionMembers08 } from "./object-union-08.mts";

export const DU8 = /*#__PURE__*/ discriminatedUnion(
  "kind",
  ...objectUnionMembers08,
);
