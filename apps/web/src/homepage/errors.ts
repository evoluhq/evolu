import {
  assertEqual,
  assertErr,
  localizeTypes,
  NonEmptyTrimmedString100,
} from "@evolu/common";
import { cs } from "@evolu/common/intl";

// A failed validation returns its error as plain data, not a thrown Error.
const result = NonEmptyTrimmedString100.fromUnknown("");
assertErr(result);
assertEqual(result.error, { type: "MinLength1", min: 1, value: "" });

// formatError turns the data into a message.
assertEqual(
  NonEmptyTrimmedString100.formatError(result.error),
  'The value "" does not meet the minimum length of 1.',
);

// A localized copy validates the same and changes only the messages. Every
// error the Type can return needs a formatter, or it doesn't compile.
const { cs: czech } = localizeTypes(
  { Title: NonEmptyTrimmedString100 },
  {
    cs: {
      String: cs.formatStringError,
      Trimmed: cs.formatTrimmedError,
      MinLength1: cs.formatMinLengthError,
      MaxLength100: cs.formatMaxLengthError,
    },
  },
);
assertEqual(czech.Title.formatError(result.error), "Text nesmí být prázdný.");
