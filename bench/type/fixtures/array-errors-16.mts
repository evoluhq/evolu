import { array, type InferErrors } from "./chains/api.mts";
import { T16 } from "./chains/factory-16.mts";

const A = array(T16);
void A;

export type Errors = InferErrors<typeof A>;
