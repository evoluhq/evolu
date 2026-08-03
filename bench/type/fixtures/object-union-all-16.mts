import { type InferErrors } from "./chains/api.mts";
import { OU16 } from "./chains/object-union-16.mts";

export type Input = typeof OU16.Input;
export type Output = typeof OU16.Output;
export type Errors = InferErrors<typeof OU16>;
export type FromUnknownInput = Parameters<typeof OU16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof OU16.fromUnknown>;
export type FromInput = Parameters<typeof OU16.from>[0];
export type FromResult = ReturnType<typeof OU16.from>;
export type FromParentInput = Parameters<typeof OU16.from.parent>[0];
export type FromParentResult = ReturnType<typeof OU16.from.parent>;
export type ToInput = Parameters<typeof OU16.to>[0];
export type ToResult = ReturnType<typeof OU16.to>;
export type Members = typeof OU16.members;
export type Parent = typeof OU16.parent;
