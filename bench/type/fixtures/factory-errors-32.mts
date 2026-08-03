import { type InferErrors } from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

export type Errors = InferErrors<typeof T32>;
