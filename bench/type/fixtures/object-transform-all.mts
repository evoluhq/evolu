import {
  object,
  ok,
  optional,
  String,
  transform,
  type InferErrors,
} from "./chains/api.mts";
import {
  NumberFromString,
  Positive,
} from "./chains/number-from-string.mts";

const EncodedModel = object({
  value: NumberFromString,
  note: optional(String),
});
const OutputModel = object({
  value: Positive,
  note: optional(String),
});
const _OT = transform(
  "ObjectTransform",
  EncodedModel,
  OutputModel,
  {
    from: ok,
    to: (value) => value,
  },
);

export type Input = typeof _OT.Input;
export type Output = typeof _OT.Output;
export type Errors = InferErrors<typeof _OT>;
export type NodeError = typeof _OT.Error;
export type FromUnknownInput = Parameters<typeof _OT.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _OT.fromUnknown>;
export type FromInput = Parameters<typeof _OT.from>[0];
export type FromResult = ReturnType<typeof _OT.from>;
export type From1Input = Parameters<typeof _OT.from.parent>[0];
export type From1Result = ReturnType<typeof _OT.from.parent>;
export type From2Input = Parameters<typeof _OT.from.parent.parent>[0];
export type From2Result = ReturnType<typeof _OT.from.parent.parent>;
export type ToInput = Parameters<typeof _OT.to>[0];
export type ToResult = ReturnType<typeof _OT.to>;
export type Parent = typeof _OT.parent;
export type OutputType = typeof _OT.output;
export type EncodedModelNodeError = typeof EncodedModel.Error;
export type EncodedModelErrors = InferErrors<typeof EncodedModel>;
export type OutputModelNodeError = typeof OutputModel.Error;
export type OutputModelErrors = InferErrors<typeof OutputModel>;
