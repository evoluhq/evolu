import {
  brand,
  lessThanOrEqualTo,
  maxLength,
  minLength,
  PositiveInt,
  TrimmedString,
  type InferErrors,
} from "./chains/api.mts";

export const Label = /*#__PURE__*/ brand(
  "Label",
  /*#__PURE__*/ maxLength(50)(
    /*#__PURE__*/ minLength(1)(TrimmedString),
  ),
);

export const Age = /*#__PURE__*/ brand(
  "Age",
  /*#__PURE__*/ lessThanOrEqualTo(99)(PositiveInt),
);

export type LabelOutput = typeof Label.Output;
export type TrimmedStringOutput = typeof TrimmedString.Output;
export type LabelErrors = InferErrors<typeof Label>;
export type LabelFromResult = ReturnType<typeof Label.from>;
export type LabelFromStringResult = ReturnType<
  typeof Label.from.parent.parent.parent.parent
>;
export type LabelFromTrimmedInput = Parameters<
  typeof Label.from.parent.parent.parent
>[0];
export type LabelFromTrimmedResult = ReturnType<
  typeof Label.from.parent.parent.parent
>;

export type AgeOutput = typeof Age.Output;
export type PositiveIntOutput = typeof PositiveInt.Output;
export type AgeErrors = InferErrors<typeof Age>;
export type AgeFromResult = ReturnType<typeof Age.from>;
export type AgeFromNumberResult = ReturnType<
  typeof Age.from.parent.parent.parent.parent.parent
>;
export type AgeFromPositiveIntInput = Parameters<
  typeof Age.from.parent.parent
>[0];
export type AgeFromPositiveIntResult = ReturnType<
  typeof Age.from.parent.parent
>;
