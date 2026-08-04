import { set } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const S = set(T1);
void S;

export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;
