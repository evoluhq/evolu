import { type InferErrors } from "./chains/api.mts";
import { OU8 } from "./chains/object-union-08.mts";

export type Input = typeof OU8.Input;
export type Output = typeof OU8.Output;
export type Errors = InferErrors<typeof OU8>;
export type FromUnknownInput = Parameters<typeof OU8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof OU8.fromUnknown>;
export type FromInput = Parameters<typeof OU8.from>[0];
export type FromResult = ReturnType<typeof OU8.from>;
export type FromParentInput = Parameters<typeof OU8.from.parent>[0];
export type FromParentResult = ReturnType<typeof OU8.from.parent>;
export type ToInput = Parameters<typeof OU8.to>[0];
export type ToResult = ReturnType<typeof OU8.to>;
export type Members = typeof OU8.members;
export type Parent = typeof OU8.parent;
