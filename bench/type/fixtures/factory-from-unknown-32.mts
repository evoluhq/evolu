import { T32 } from "./chains/factory-32.mts";

export type FromUnknownInput = Parameters<typeof T32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof T32.fromUnknown>;
