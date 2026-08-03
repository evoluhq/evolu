import { T8 } from "./chains/factory-08.mts";

export type OrNullInput = Parameters<typeof T8.orNull>[0];
export type OrNullOutput = ReturnType<typeof T8.orNull>;
