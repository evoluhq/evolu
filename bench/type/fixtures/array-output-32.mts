import { array } from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

const A = array(T32);
void A;

export type Output = typeof A.Output;
