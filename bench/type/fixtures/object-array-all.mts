import {
  array,
  object,
  optional,
  String,
  type InferErrors,
} from "./chains/api.mts";
import { NumberFromString } from "./chains/number-from-string.mts";

const Item = object({
  value: NumberFromString,
  note: optional(String),
});
const _OA = array(Item);

export type Input = typeof _OA.Input;
export type Output = typeof _OA.Output;
export type Errors = InferErrors<typeof _OA>;
export type NodeError = typeof _OA.Error;
export type FromUnknownInput = Parameters<typeof _OA.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _OA.fromUnknown>;
export type FromInput = Parameters<typeof _OA.from>[0];
export type FromResult = ReturnType<typeof _OA.from>;
export type FromParentResult = ReturnType<typeof _OA.from.parent>;
export type ToInput = Parameters<typeof _OA.to>[0];
export type ToResult = ReturnType<typeof _OA.to>;
export type Parent = typeof _OA.parent;
export type Element = typeof _OA.element;
export type ElementNodeError = typeof Item.Error;
export type ElementErrors = InferErrors<typeof Item>;
