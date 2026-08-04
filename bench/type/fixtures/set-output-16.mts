import { set } from "./chains/api.mts";
import { T16 } from "./chains/factory-16.mts";

const S = set(T16);
void S;

export type Output = typeof S.Output;
