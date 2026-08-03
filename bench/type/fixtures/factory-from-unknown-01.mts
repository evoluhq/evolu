import { T1 } from "./chains/factory-01.mts";

export type FromUnknownInput = Parameters<typeof T1.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof T1.fromUnknown>;
