import { set } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const S = set(T4);
void S;

export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;
