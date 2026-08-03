import { T2 } from "./chains/factory-02.mts";

export type DeepestFromInput = Parameters<typeof T2.from.parent.parent>[0];
export type DeepestFromResult = ReturnType<typeof T2.from.parent.parent>;
