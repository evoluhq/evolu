import { type InferErrors } from "./chains/api.mts";
import { NO32 } from "./chains/nested-object-32.mts";

export type Input = typeof NO32.Input;
export type Output = typeof NO32.Output;
export type Errors = InferErrors<typeof NO32>;
export type FromUnknownInput = Parameters<typeof NO32.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof NO32.fromUnknown>;
export type FromInput = Parameters<typeof NO32.from>[0];
export type FromResult = ReturnType<typeof NO32.from>;
export type FromParentInput = Parameters<typeof NO32.from.parent>[0];
export type FromParentResult = ReturnType<typeof NO32.from.parent>;
export type ToInput = Parameters<typeof NO32.to>[0];
export type ToResult = ReturnType<typeof NO32.to>;
export type Parent = typeof NO32.parent;
export type Props = typeof NO32.props;
