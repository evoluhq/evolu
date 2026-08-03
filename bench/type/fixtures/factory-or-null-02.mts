import { T2 } from "./chains/factory-02.mts";

export type OrNullInput = Parameters<typeof T2.orNull>[0];
export type OrNullOutput = ReturnType<typeof T2.orNull>;
