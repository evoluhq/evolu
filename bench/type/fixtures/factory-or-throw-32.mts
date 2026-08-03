import { T32 } from "./chains/factory-32.mts";

export type OrThrowInput = Parameters<typeof T32.orThrow>[0];
export type OrThrowOutput = ReturnType<typeof T32.orThrow>;
