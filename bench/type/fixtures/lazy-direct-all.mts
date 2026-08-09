import {
  array,
  lazy,
  object,
  String,
  type ArrayElementsError,
  type ArrayError,
  type InferErrors,
  type LazyType,
  type ObjectError,
  type ObjectPropertiesError,
  type TypeOfError,
} from "../../../packages/common/src/Type2.ts";
import {
  NumberFromString,
  type NumberFromStringError,
} from "./chains/number-from-string.mts";

export interface TreeInput {
  readonly value: string;
  readonly children: ReadonlyArray<TreeInput>;
}

export interface TreeOutput {
  readonly value: number;
  readonly children: ReadonlyArray<TreeOutput>;
}

export interface TreeInputError
  extends ObjectError<{
    readonly value: TypeOfError<"String">;
    readonly children: ArrayError<TreeInputError>;
  }> {}

export interface TreeFromError
  extends ObjectPropertiesError<{
    readonly value: NumberFromStringError;
    readonly children: ArrayElementsError<TreeFromError>;
  }> {}

export interface TreeError
  extends ObjectError<{
    readonly value: TypeOfError<"String"> | NumberFromStringError;
    readonly children: ArrayError<TreeError>;
  }> {}

const _Tree: LazyType<
  TreeInput,
  TreeOutput,
  TreeFromError,
  TreeInputError,
  TreeError,
  TreeInput,
  false
> = lazy(() =>
  object({ value: NumberFromString, children: array(_Tree) }),
);

export type Declaration = typeof _Tree;
export type Input = typeof _Tree.Input;
export type Output = typeof _Tree.Output;
export type NodeError = typeof _Tree.Error;
export type InputError = typeof _Tree.parent.Error;
export type Errors = InferErrors<typeof _Tree>;
export type FromUnknownInput = Parameters<typeof _Tree.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof _Tree.fromUnknown>;
export type FromInput = Parameters<typeof _Tree.from>[0];
export type FromResult = ReturnType<typeof _Tree.from>;
export type FromParentInput = Parameters<typeof _Tree.from.parent>[0];
export type FromParentResult = ReturnType<typeof _Tree.from.parent>;
export type ToInput = Parameters<typeof _Tree.to>[0];
export type ToResult = ReturnType<typeof _Tree.to>;
export type Parent = typeof _Tree.parent;
