import { array } from "./chains/api.mts";
import { T16 } from "./chains/factory-16.mts";

const A = array(T16);
void A;

export type Output = typeof A.Output;
