import { set } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const S = set(T4);
void S;

export type Output = typeof S.Output;
