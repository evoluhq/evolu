import { set } from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

const S = set(T32);
void S;

export type Output = typeof S.Output;
