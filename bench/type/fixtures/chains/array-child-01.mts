import {
  createType,
  err,
  formatBenchmarkTypeError,
  ok,
  type TypeError,
} from "./api.mts";
import { ValidatedValues } from "./array-child-root.mts";

export interface ArrayChild1Error extends TypeError<"ArrayChild1"> {
  readonly value: typeof ValidatedValues.Output;
}

export const AC1 = /*#__PURE__*/ createType(
  "ArrayChild1",
  ValidatedValues,
  (value) =>
    value.length >= 0
      ? ok(value)
      : err<ArrayChild1Error>({ type: "ArrayChild1", value }),
  formatBenchmarkTypeError,
);
