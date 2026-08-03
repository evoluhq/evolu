import { array, type InferErrors } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const A = array(T8);
void A;

export type Errors = InferErrors<typeof A>;
