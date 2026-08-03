import { array } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const A = array(T8);
void A;

export type Output = typeof A.Output;
