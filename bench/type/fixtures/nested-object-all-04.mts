import { type InferErrors } from "./chains/api.mts";
import { NO4 } from "./chains/nested-object-04.mts";

export type Input = typeof NO4.Input;
export type Output = typeof NO4.Output;
export type Errors = InferErrors<typeof NO4>;
export type FromUnknownInput = Parameters<typeof NO4.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof NO4.fromUnknown>;
export type FromInput = Parameters<typeof NO4.from>[0];
export type FromResult = ReturnType<typeof NO4.from>;
export type FromParentInput = Parameters<typeof NO4.from.parent>[0];
export type FromParentResult = ReturnType<typeof NO4.from.parent>;
export type ToInput = Parameters<typeof NO4.to>[0];
export type ToResult = ReturnType<typeof NO4.to>;
export type Parent = typeof NO4.parent;
export type Props = typeof NO4.props;
