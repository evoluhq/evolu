import { discriminatedUnion } from "./api.mts";
import { objectUnionMembers04 } from "./object-union-04.mts";

export const DU4 = /*#__PURE__*/ discriminatedUnion(
  "kind",
  ...objectUnionMembers04,
);
