import { T4 } from "./chains/factory-04.mts";

export type DeepestFromInput = Parameters<
  typeof T4.from.parent.parent.parent.parent
>[0];
export type DeepestFromResult = ReturnType<
  typeof T4.from.parent.parent.parent.parent
>;
