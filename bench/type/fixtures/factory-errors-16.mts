import { type InferErrors } from "./chains/api.mts";
import { T16 } from "./chains/factory-16.mts";

export type Errors = InferErrors<typeof T16>;
