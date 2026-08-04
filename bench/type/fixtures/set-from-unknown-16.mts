import { set } from "./chains/api.mts";
import { T16 } from "./chains/factory-16.mts";

const S = set(T16);
void S;

export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;
