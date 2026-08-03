import {
  lazy,
  Number,
  object,
  optional,
  String,
  type InferErrors,
  type LazyType,
  type ObjectError,
  type TypeOfError,
} from "../../../packages/common/src/Type2.ts";

export interface Left {
  readonly label: string;
  readonly right?: Right;
}

export interface Right {
  readonly count: number;
  readonly left?: Left;
}

export interface LeftError
  extends ObjectError<{
    readonly label: TypeOfError<"String">;
    readonly right?: RightError;
  }> {}

export interface RightError
  extends ObjectError<{
    readonly count: TypeOfError<"Number">;
    readonly left?: LeftError;
  }> {}

const _Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(() =>
  object({ label: String, right: optional(_Right) }),
);

const _Right: LazyType<Right, Right, never, RightError, RightError> = lazy(() =>
  object({ count: Number, left: optional(_Left) }),
);

export type LeftDeclaration = typeof _Left;
export type LeftInput = typeof _Left.Input;
export type LeftOutput = typeof _Left.Output;
export type LeftNodeError = typeof _Left.Error;
export type LeftInputError = typeof _Left.parent.Error;
export type LeftErrors = InferErrors<typeof _Left>;
export type LeftFromUnknownResult = ReturnType<typeof _Left.fromUnknown>;
export type LeftFromResult = ReturnType<typeof _Left.from>;
export type LeftFromParentResult = ReturnType<typeof _Left.from.parent>;
export type LeftToResult = ReturnType<typeof _Left.to>;
export type LeftParent = typeof _Left.parent;

export type RightDeclaration = typeof _Right;
export type RightInput = typeof _Right.Input;
export type RightOutput = typeof _Right.Output;
export type RightNodeError = typeof _Right.Error;
export type RightInputError = typeof _Right.parent.Error;
export type RightErrors = InferErrors<typeof _Right>;
export type RightFromUnknownResult = ReturnType<typeof _Right.fromUnknown>;
export type RightFromResult = ReturnType<typeof _Right.from>;
export type RightFromParentResult = ReturnType<typeof _Right.from.parent>;
export type RightToResult = ReturnType<typeof _Right.to>;
export type RightParent = typeof _Right.parent;
