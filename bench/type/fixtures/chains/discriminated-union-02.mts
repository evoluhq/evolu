import { discriminatedUnion } from "./api.mts";
import { objectUnionMembers02 } from "./object-union-02.mts";

export const DU2 = /*#__PURE__*/ discriminatedUnion(
  "kind",
  ...objectUnionMembers02,
);
