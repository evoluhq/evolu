import { T16 } from "./chains/factory-16.mts";

export type FromUnknownInput = Parameters<typeof T16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof T16.fromUnknown>;
