import { type InferErrors } from "./chains/api.mts";
import { NO1 } from "./chains/nested-object-01.mts";

export type Input = typeof NO1.Input;
export type Output = typeof NO1.Output;
export type Errors = InferErrors<typeof NO1>;
export type FromUnknownInput = Parameters<typeof NO1.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof NO1.fromUnknown>;
export type FromInput = Parameters<typeof NO1.from>[0];
export type FromResult = ReturnType<typeof NO1.from>;
export type FromParentInput = Parameters<typeof NO1.from.parent>[0];
export type FromParentResult = ReturnType<typeof NO1.from.parent>;
export type ToInput = Parameters<typeof NO1.to>[0];
export type ToResult = ReturnType<typeof NO1.to>;
export type Parent = typeof NO1.parent;
export type Props = typeof NO1.props;
