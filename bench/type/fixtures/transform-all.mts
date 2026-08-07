import {
  err,
  formatBenchmarkTypeError,
  type InferErrors,
  ok,
  String,
  transform,
  type TypeError,
} from "./chains/api.mts";

interface Transform1Error extends TypeError<"Transform1"> {
  readonly value: string;
}

const T1 = transform(
  "Transform1",
  String,
  String,
  {
    from: (value) =>
      value.length >= 0
        ? ok(value)
        : err<Transform1Error>({ type: "Transform1", value }),
    to: (value) => value,
  },
  formatBenchmarkTypeError,
);

interface Transform2Error extends TypeError<"Transform2"> {
  readonly value: string;
}

const T2 = transform(
  "Transform2",
  T1,
  String,
  {
    from: (value) =>
      value.length >= 0
        ? ok(value)
        : err<Transform2Error>({ type: "Transform2", value }),
    to: (value) => value,
  },
  formatBenchmarkTypeError,
);

interface Transform3Error extends TypeError<"Transform3"> {
  readonly value: string;
}

const T3 = transform(
  "Transform3",
  T2,
  String,
  {
    from: (value) =>
      value.length >= 0
        ? ok(value)
        : err<Transform3Error>({ type: "Transform3", value }),
    to: (value) => value,
  },
  formatBenchmarkTypeError,
);

interface Transform4Error extends TypeError<"Transform4"> {
  readonly value: string;
}

const _T4 = transform(
  "Transform4",
  T3,
  String,
  {
    from: (value) =>
      value.length >= 0
        ? ok(value)
        : err<Transform4Error>({ type: "Transform4", value }),
    to: (value) => value,
  },
  formatBenchmarkTypeError,
);

export type Input = typeof _T4.Input;
export type Output = typeof _T4.Output;
export type Errors = InferErrors<typeof _T4>;
export type FromResult = ReturnType<typeof _T4.from>;
export type From3Result = ReturnType<typeof _T4.from.parent.parent.parent>;
export type From4Result = ReturnType<
  typeof _T4.from.parent.parent.parent.parent
>;
export type ToResult = ReturnType<typeof _T4.to>;
export type To1Result = ReturnType<typeof _T4.to.parent>;
export type To3Result = ReturnType<typeof _T4.to.parent.parent.parent>;
export type To4Result = ReturnType<
  typeof _T4.to.parent.parent.parent.parent
>;
