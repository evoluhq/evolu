import { T4 } from "./chains/factory-04.mts";

export type OrNullInput = Parameters<typeof T4.orNull>[0];
export type OrNullOutput = ReturnType<typeof T4.orNull>;
