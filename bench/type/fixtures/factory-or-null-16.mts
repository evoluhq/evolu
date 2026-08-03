import { T16 } from "./chains/factory-16.mts";

export type OrNullInput = Parameters<typeof T16.orNull>[0];
export type OrNullOutput = ReturnType<typeof T16.orNull>;
