import {
  lazy,
  localizeTypes,
  Number,
  object,
  optional,
  String,
  type LazyType,
  type ObjectError,
  type TypeOfError,
} from "../../../packages/common/src/Type.ts";

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

const Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(() =>
  object({ label: String, right: optional(Right) }),
);

const Right: LazyType<Right, Right, never, RightError, RightError> = lazy(() =>
  object({ count: Number, left: optional(Left) }),
);

const typesByLocale = localizeTypes(
  { Left, Right },
  {
    cs: {
      Number: () => "Hodnota musí být číslo.",
      Object: () => "Objekt není platný.",
      String: () => "Hodnota musí být text.",
    },
    en: {
      Number: () => "The value must be a number.",
      Object: () => "The object is invalid.",
      String: () => "The value must be text.",
    },
  },
);

export type Locales = keyof typeof typesByLocale;
export type CzechLeft = typeof typesByLocale.cs.Left;
export type CzechRight = typeof typesByLocale.cs.Right;
export type EnglishLeft = typeof typesByLocale.en.Left;
export type EnglishRight = typeof typesByLocale.en.Right;
