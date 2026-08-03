import {
  optional,
  typed,
  type InferErrors,
} from "./chains/api.mts";
import { NumberFromString } from "./chains/number-from-string.mts";

const _T = typed("Model", {
  required: NumberFromString,
  optional: optional(NumberFromString),
});

export type Input = typeof _T.Input;
export type Output = typeof _T.Output;
export type Errors = InferErrors<typeof _T>;
export type NodeError = typeof _T.Error;
export type FromUnknownInput = Parameters<typeof _T.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _T.fromUnknown>;
export type FromInput = Parameters<typeof _T.from>[0];
export type FromResult = ReturnType<typeof _T.from>;
export type FromParentInput = Parameters<typeof _T.from.parent>[0];
export type FromParentResult = ReturnType<typeof _T.from.parent>;
export type ToInput = Parameters<typeof _T.to>[0];
export type ToResult = ReturnType<typeof _T.to>;
export type Parent = typeof _T.parent;
export type Props = typeof _T.props;
