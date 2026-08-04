import { set, type InferErrors } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const S = set(T8);
void S;

export type Errors = InferErrors<typeof S>;
