import {
  brand,
  err,
  formatBenchmarkTypeError,
  ok,
  type BrandFactory,
  type InferErrors,
  type TypeError,
} from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

export interface ReusableError extends TypeError<"Reusable"> {
  readonly value: string;
}

export const reusable: BrandFactory<"Reusable", string, ReusableError> = (
  parent,
) =>
  brand(
    "Reusable",
    parent,
    (value) =>
      value.length >= 0
        ? ok()
        : err<ReusableError>({ type: "Reusable", value }),
    formatBenchmarkTypeError,
  );

export const Reusable = /*#__PURE__*/ reusable(T32);

export type Factory = typeof reusable;
export type Output = typeof Reusable.Output;
export type Errors = InferErrors<typeof Reusable>;
export type FromResult = ReturnType<typeof Reusable.from>;
export type DeepestFromResult = ReturnType<
  typeof Reusable.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;
export type FromParentInput = Parameters<typeof Reusable.from.parent>[0];
export type FromParentResult = ReturnType<typeof Reusable.from.parent>;
