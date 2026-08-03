import { discriminatedUnion } from "./api.mts";
import { objectUnionMembers16 } from "./object-union-16.mts";

export const DU16 = /*#__PURE__*/ discriminatedUnion(
  "kind",
  ...objectUnionMembers16,
);
