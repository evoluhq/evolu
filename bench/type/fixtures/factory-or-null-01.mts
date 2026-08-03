import { T1 } from "./chains/factory-01.mts";

export type OrNullInput = Parameters<typeof T1.orNull>[0];
export type OrNullOutput = ReturnType<typeof T1.orNull>;
