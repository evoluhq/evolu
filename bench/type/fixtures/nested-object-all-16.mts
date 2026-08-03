import { type InferErrors } from "./chains/api.mts";
import { NO16 } from "./chains/nested-object-16.mts";

export type Input = typeof NO16.Input;
export type Output = typeof NO16.Output;
export type Errors = InferErrors<typeof NO16>;
export type FromUnknownInput = Parameters<typeof NO16.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof NO16.fromUnknown>;
export type FromInput = Parameters<typeof NO16.from>[0];
export type FromResult = ReturnType<typeof NO16.from>;
export type FromParentInput = Parameters<typeof NO16.from.parent>[0];
export type FromParentResult = ReturnType<typeof NO16.from.parent>;
export type ToInput = Parameters<typeof NO16.to>[0];
export type ToResult = ReturnType<typeof NO16.to>;
export type Parent = typeof NO16.parent;
export type Props = typeof NO16.props;
