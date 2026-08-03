import { T16 } from "./chains/factory-16.mts";

export type OrThrowInput = Parameters<typeof T16.orThrow>[0];
export type OrThrowOutput = ReturnType<typeof T16.orThrow>;
