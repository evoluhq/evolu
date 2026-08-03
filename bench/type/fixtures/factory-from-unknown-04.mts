import { T4 } from "./chains/factory-04.mts";

export type FromUnknownInput = Parameters<typeof T4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof T4.fromUnknown>;
