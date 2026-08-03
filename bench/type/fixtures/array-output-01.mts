import { array } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const A = array(T1);
void A;

export type Output = typeof A.Output;
