import { object, optional, type InferErrors } from "./chains/api.mts";
import { T8 } from "./chains/factory-08.mts";

const O = object({ required: T8, optional: optional(T8) });
void O;

export type Output = typeof O.Output;
export type Errors = InferErrors<typeof O>;
export type FromUnknownInput = Parameters<typeof O.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof O.fromUnknown>;
export type FromInput = Parameters<typeof O.from>[0];
export type FromResult = ReturnType<typeof O.from>;
export type FromParentInput = Parameters<typeof O.from.parent>[0];
export type FromParentResult = ReturnType<typeof O.from.parent>;
