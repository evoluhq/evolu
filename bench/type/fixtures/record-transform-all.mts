import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  record,
  String,
  transform,
  type InferErrors,
  type TypeError,
} from "./chains/api.mts";
import { NumberFromString } from "./chains/number-from-string.mts";

interface LowercaseError extends TypeError<"Lowercase"> {
  readonly value: string;
}

const Lowercase = brand(
  "Lowercase",
  String,
  (value) =>
    value === value.toLowerCase()
      ? ok()
      : err<LowercaseError>({ type: "Lowercase", value }),
  formatBenchmarkTypeError,
);

const LowercaseFromString = transform(
  "LowercaseFromString",
  String,
  Lowercase,
  {
    from: (value) => ok(value.toLowerCase()),
    to: (value) => value,
  },
);

const R = record(LowercaseFromString, NumberFromString);
const Imported = brand("ImportedRecord", R);
void Imported;

export type Input = typeof R.Input;
export type Output = typeof R.Output;
export type Errors = InferErrors<typeof R>;
export type NodeError = typeof R.Error;
export type Parent = typeof R.parent;
export type FromUnknownResult = ReturnType<typeof R.fromUnknown>;
export type FromResult = ReturnType<typeof R.from>;
export type FromParentResult = ReturnType<typeof R.from.parent>;
export type ToResult = ReturnType<typeof R.to>;
export type ImportedErrors = InferErrors<typeof Imported>;
export type ImportedFromResult = ReturnType<typeof Imported.from>;
export type ImportedFromParentResult = ReturnType<typeof Imported.from.parent>;
export type ImportedFrom2Result = ReturnType<
  typeof Imported.from.parent.parent
>;
export type LowercaseKey = typeof Lowercase.Output;
export type LowercaseKeyError = LowercaseError;
