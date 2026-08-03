import { type InferErrors } from "./chains/api.mts";
import { MU2 } from "./chains/mixed-union-02.mts";

export type Output = typeof MU2.Output;
export type Errors = InferErrors<typeof MU2>;
export type FromUnknownInput = Parameters<typeof MU2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof MU2.fromUnknown>;
export type FromInput = Parameters<typeof MU2.from>[0];
export type FromResult = ReturnType<typeof MU2.from>;
export type FromParentInput = Parameters<typeof MU2.from.parent>[0];
export type FromParentResult = ReturnType<typeof MU2.from.parent>;
export type Members = typeof MU2.members;
export type Parent = typeof MU2.parent;
