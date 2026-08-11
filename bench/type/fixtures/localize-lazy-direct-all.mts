import {
  array,
  lazy,
  localizeTypes,
  object,
  String,
  type ArrayError,
  type LazyType,
  type ObjectError,
  type TypeOfError,
} from "../../../packages/common/src/Type.ts";

export interface Tree {
  readonly value: string;
  readonly children: ReadonlyArray<Tree>;
}

export interface TreeError
  extends ObjectError<{
    readonly value: TypeOfError<"String">;
    readonly children: ArrayError<TreeError>;
  }> {}

const Tree: LazyType<Tree, Tree, never, TreeError, TreeError> = lazy(() =>
  object({ value: String, children: array(Tree) }),
);

const TypesByLocale = localizeTypes(
  { Tree },
  {
    cs: {
      Array: () => "Pole není platné.",
      Object: () => "Objekt není platný.",
      String: () => "Hodnota musí být text.",
    },
    en: {
      Array: () => "The array is invalid.",
      Object: () => "The object is invalid.",
      String: () => "The value must be text.",
    },
  },
);

export type Locales = keyof typeof TypesByLocale;
export type CzechTree = typeof TypesByLocale.cs.Tree;
export type EnglishTree = typeof TypesByLocale.en.Tree;
export type CzechTreeError = Parameters<
  typeof TypesByLocale.cs.Tree.formatError
>[0];
