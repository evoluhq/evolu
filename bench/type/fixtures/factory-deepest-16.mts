import { T16 } from "./chains/factory-16.mts";

export type DeepestFromInput = Parameters<
  typeof T16.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type DeepestFromResult = ReturnType<
  typeof T16.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;
