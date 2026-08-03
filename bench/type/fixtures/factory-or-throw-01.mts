import { T1 } from "./chains/factory-01.mts";

export type OrThrowInput = Parameters<typeof T1.orThrow>[0];
export type OrThrowOutput = ReturnType<typeof T1.orThrow>;
