import { T2 } from "./chains/factory-02.mts";

export type FromUnknownInput = Parameters<typeof T2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof T2.fromUnknown>;
