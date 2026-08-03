import {
  object,
  optional,
  type InferErrors,
} from "./chains/api.mts";
import { NumberFromString } from "./chains/number-from-string.mts";

const _TO = object(
  {
    required: NumberFromString,
    optional: optional(NumberFromString),
  },
);

export type Input = typeof _TO.Input;
export type Output = typeof _TO.Output;
export type Errors = InferErrors<typeof _TO>;
export type NodeError = typeof _TO.Error;
export type FromUnknownInput = Parameters<typeof _TO.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _TO.fromUnknown>;
export type FromInput = Parameters<typeof _TO.from>[0];
export type FromResult = ReturnType<typeof _TO.from>;
export type FromParentResult = ReturnType<typeof _TO.from.parent>;
export type ToInput = Parameters<typeof _TO.to>[0];
export type ToResult = ReturnType<typeof _TO.to>;
export type Parent = typeof _TO.parent;
export type Props = typeof _TO.props;
