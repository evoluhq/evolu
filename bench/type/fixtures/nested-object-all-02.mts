import { type InferErrors } from "./chains/api.mts";
import { NO2 } from "./chains/nested-object-02.mts";

export type Input = typeof NO2.Input;
export type Output = typeof NO2.Output;
export type Errors = InferErrors<typeof NO2>;
export type FromUnknownInput = Parameters<typeof NO2.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof NO2.fromUnknown>;
export type FromInput = Parameters<typeof NO2.from>[0];
export type FromResult = ReturnType<typeof NO2.from>;
export type FromParentInput = Parameters<typeof NO2.from.parent>[0];
export type FromParentResult = ReturnType<typeof NO2.from.parent>;
export type ToInput = Parameters<typeof NO2.to>[0];
export type ToResult = ReturnType<typeof NO2.to>;
export type Parent = typeof NO2.parent;
export type Props = typeof NO2.props;
