import {
  object,
  optional,
  type InferErrors,
} from "./chains/api.mts";
import { U32 } from "./chains/union-32.mts";

const _UO = object({
  required: U32,
  optional: optional(U32),
});

export type Input = typeof _UO.Input;
export type Output = typeof _UO.Output;
export type Errors = InferErrors<typeof _UO>;
export type NodeError = typeof _UO.Error;
export type FromUnknownInput = Parameters<typeof _UO.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _UO.fromUnknown>;
export type FromInput = Parameters<typeof _UO.from>[0];
export type FromResult = ReturnType<typeof _UO.from>;
export type FromParentResult = ReturnType<typeof _UO.from.parent>;
export type ToInput = Parameters<typeof _UO.to>[0];
export type ToResult = ReturnType<typeof _UO.to>;
export type Parent = typeof _UO.parent;
export type Props = typeof _UO.props;
