import { T32 } from "./chains/factory-32.mts";

export type OrNullInput = Parameters<typeof T32.orNull>[0];
export type OrNullOutput = ReturnType<typeof T32.orNull>;
