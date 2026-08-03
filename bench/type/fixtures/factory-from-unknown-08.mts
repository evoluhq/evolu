import { T8 } from "./chains/factory-08.mts";

export type FromUnknownInput = Parameters<typeof T8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof T8.fromUnknown>;
