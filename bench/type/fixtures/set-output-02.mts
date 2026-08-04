import { set } from "./chains/api.mts";
import { T2 } from "./chains/factory-02.mts";

const S = set(T2);
void S;

export type Output = typeof S.Output;
