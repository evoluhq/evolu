import {
  brand,
  createType,
  err,
  formatBenchmarkTypeError,
  object,
  ok,
  optional,
  String,
  type InferErrors,
  type TypeError,
} from "./chains/api.mts";
import { Number } from "../../../packages/common/src/Type2.ts";

interface NonEmptyTitleError extends TypeError<"NonEmptyTitle"> {
  readonly value: string;
}

const NonEmptyTitle = brand(
  "NonEmptyTitle",
  String,
  (value) =>
    value.length > 0
      ? ok()
      : err<NonEmptyTitleError>({ type: "NonEmptyTitle", value }),
  formatBenchmarkTypeError,
);

interface ShortTitleError extends TypeError<"ShortTitle"> {
  readonly value: string;
}

const ShortTitle = brand(
  "ShortTitle",
  NonEmptyTitle,
  (value) =>
    value.length <= 20
      ? ok()
      : err<ShortTitleError>({ type: "ShortTitle", value }),
  formatBenchmarkTypeError,
);

interface PositiveCountError extends TypeError<"PositiveCount"> {
  readonly value: number;
}

const PositiveCount = brand(
  "PositiveCount",
  Number,
  (value) =>
    value > 0
      ? ok()
      : err<PositiveCountError>({ type: "PositiveCount", value }),
  formatBenchmarkTypeError,
);

const ChildModel = object({
  title: ShortTitle,
  count: PositiveCount,
  note: optional(String),
});

interface ImportedModelError extends TypeError<"ImportedModel"> {
  readonly value: typeof ChildModel.Output;
}

const ImportedModel = createType(
  "ImportedModel",
  ChildModel,
  (value) =>
    value.count >= 2
      ? ok(value)
      : err<ImportedModelError>({ type: "ImportedModel", value }),
  formatBenchmarkTypeError,
);
const _OC = brand("ReimportedModel", ImportedModel);

export type Input = typeof _OC.Input;
export type Output = typeof _OC.Output;
export type Errors = InferErrors<typeof _OC>;
export type NodeError = typeof _OC.Error;
export type FromUnknownInput = Parameters<typeof _OC.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _OC.fromUnknown>;
export type FromInput = Parameters<typeof _OC.from>[0];
export type FromResult = ReturnType<typeof _OC.from>;
export type From1Input = Parameters<typeof _OC.from.parent>[0];
export type From1Result = ReturnType<typeof _OC.from.parent>;
export type From2Input = Parameters<typeof _OC.from.parent.parent>[0];
export type From2Result = ReturnType<typeof _OC.from.parent.parent>;
export type From3Input = Parameters<typeof _OC.from.parent.parent.parent>[0];
export type From3Result = ReturnType<typeof _OC.from.parent.parent.parent>;
export type ToInput = Parameters<typeof _OC.to>[0];
export type ToResult = ReturnType<typeof _OC.to>;
export type Parent = typeof _OC.parent;
export type Model = typeof ChildModel;
export type ImportedError = ImportedModelError;
export type NonEmptyError = NonEmptyTitleError;
export type ShortError = ShortTitleError;
export type CountError = PositiveCountError;
