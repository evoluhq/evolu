import { type InferErrors } from "./chains/api.mts";
import { T4 } from "./chains/factory-04.mts";

export type Errors = InferErrors<typeof T4>;
