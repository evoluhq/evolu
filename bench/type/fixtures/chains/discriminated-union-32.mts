import { discriminatedUnion } from "./api.mts";
import { objectUnionMembers32 } from "./object-union-32.mts";

export const DU32 = /*#__PURE__*/ discriminatedUnion(
  "kind",
  ...objectUnionMembers32,
);
