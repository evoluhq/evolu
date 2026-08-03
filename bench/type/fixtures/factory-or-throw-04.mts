import { T4 } from "./chains/factory-04.mts";

export type OrThrowInput = Parameters<typeof T4.orThrow>[0];
export type OrThrowOutput = ReturnType<typeof T4.orThrow>;
