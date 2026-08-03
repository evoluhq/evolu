import { array, type InferErrors } from "./chains/api.mts";
import { T1 } from "./chains/factory-01.mts";

const A = array(T1);
void A;

export type Errors = InferErrors<typeof A>;
