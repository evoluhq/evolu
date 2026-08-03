import { type InferErrors } from "./chains/api.mts";
import { NO8 } from "./chains/nested-object-08.mts";

export type Input = typeof NO8.Input;
export type Output = typeof NO8.Output;
export type Errors = InferErrors<typeof NO8>;
export type FromUnknownInput = Parameters<typeof NO8.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof NO8.fromUnknown>;
export type FromInput = Parameters<typeof NO8.from>[0];
export type FromResult = ReturnType<typeof NO8.from>;
export type FromParentInput = Parameters<typeof NO8.from.parent>[0];
export type FromParentResult = ReturnType<typeof NO8.from.parent>;
export type ToInput = Parameters<typeof NO8.to>[0];
export type ToResult = ReturnType<typeof NO8.to>;
export type Parent = typeof NO8.parent;
export type Props = typeof NO8.props;
