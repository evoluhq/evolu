import { set } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const S = set(T8);
void S;

export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;
