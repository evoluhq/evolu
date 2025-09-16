import {
  createFormatTypeError,
  MinLengthError,
  ValidMutationSizeError,
} from "@evolu/common";

/**
 * The `createFormatTypeError` function creates a unified error formatter that
 * handles both Evolu Type's built-in errors and custom errors. It also lets us
 * override the default formatting for specific errors.
 *
 * If you prefer not to reuse built-in error formatters, you can write your own
 * `formatTypeError` function from scratch. See the commented-out example at the
 * end of this file.
 */
export const formatTypeError = createFormatTypeError<
  ValidMutationSizeError | MinLengthError
>((error): string => {
  switch (error.type) {
    /**
     * If schema types are used correctly (e.g., maxLength), this error should
     * not occur. If it does, it indicates a developer mistake.
     */
    case "ValidMutationSize":
      return "This is a developer error, it should not happen 🤨";
    // Overrides a built-in error formatter.
    case "MinLength":
      return `Minimal length is: ${error.min}`;
  }
});

/*
// Note: We only need to specify the errors actually used in the app.
type AppErrors =
  | ValidMutationSizeError
  | StringError
  | MinLengthError
  | MaxLengthError
  | NullError
  | IdError
  | TrimmedError
  | MnemonicError
  | LiteralError
  // Composite errors
  | ObjectError<Record<string, AppErrors>>
  | UnionError<AppErrors>;

const formatTypeError: TypeErrorFormatter<AppErrors> = (error) => {
  // In the real code, we would use the createTypeErrorFormatter helper
  // that safely stringifies error value.
  switch (error.type) {
    case 'Id':
      return `Invalid Id on table: ${error.table}.`;
    case 'MaxLength':
      return `Max length is ${error.max}.`;
    case 'MinLength':
      return `Min length is ${error.min}.`;
    case 'Mnemonic':
      return `Invalid mnemonic: ${String(error.value)}`;
    case 'Null':
      return `Not null`;
    case 'String':
      // We can reuse existing formatter.
      return formatStringError(error);
    case 'Trimmed':
      return 'Value is not trimmed.';
    case 'ValidMutationSize':
      return 'A developer made an error, this should not happen.';
    case 'Literal':
      return formatLiteralError(error);
    // Composite Types
    case 'Union':
      return `Union errors: ${error.errors.map(formatTypeError).join(', ')}`;
    case 'Object': {
      if (
        error.reason.kind === 'ExtraKeys' ||
        error.reason.kind === 'NotObject'
      )
        return 'A developer made an error, this should not happen.';
      const firstError = Object.values(error.reason.errors).find(
        (e) => e !== undefined,
      )!;
      return formatTypeError(firstError);
    }
  }
};
*/
