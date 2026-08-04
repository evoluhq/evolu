import { set } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const S = set(T8);
void S;

export type Output = typeof S.Output;
