import { array } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

const A = array(T4);
void A;

export type Output = typeof A.Output;
