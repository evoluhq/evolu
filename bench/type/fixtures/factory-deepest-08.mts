import { T8 } from "./chains/factory-08.mts";

export type DeepestFromInput = Parameters<
  typeof T8.from.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type DeepestFromResult = ReturnType<
  typeof T8.from.parent.parent.parent.parent.parent.parent.parent.parent
>;
