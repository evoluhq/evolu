import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type InferErrors,
  type TypeError,
} from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

export interface DirectError extends TypeError<"Direct"> {
  readonly value: string;
}

export const Direct = /*#__PURE__*/ brand(
  "Direct",
  T32,
  (value) =>
    value.length >= 0
      ? ok()
      : err<DirectError>({ type: "Direct", value }),
  formatBenchmarkTypeError,
);

export type Output = typeof Direct.Output;
export type Errors = InferErrors<typeof Direct>;
export type FromResult = ReturnType<typeof Direct.from>;
export type DeepestFromResult = ReturnType<
  typeof Direct.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;
export type FromParentInput = Parameters<typeof Direct.from.parent>[0];
export type FromParentResult = ReturnType<typeof Direct.from.parent>;
