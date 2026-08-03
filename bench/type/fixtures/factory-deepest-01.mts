import { T1 } from "./chains/factory-01.mts";

export type DeepestFromInput = Parameters<typeof T1.from.parent>[0];
export type DeepestFromResult = ReturnType<typeof T1.from.parent>;
