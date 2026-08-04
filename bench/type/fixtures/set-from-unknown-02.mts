import { set } from "./chains/api.mts";
import { T2 } from "./chains/factory-02.mts";

const S = set(T2);
void S;

export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;
