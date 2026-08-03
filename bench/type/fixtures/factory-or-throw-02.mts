import { T2 } from "./chains/factory-02.mts";

export type OrThrowInput = Parameters<typeof T2.orThrow>[0];
export type OrThrowOutput = ReturnType<typeof T2.orThrow>;
