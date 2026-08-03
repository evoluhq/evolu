import {
  String,
  localizeTypes,
  minLength,
} from "../../../../../packages/common/src/Type2.ts";
import { cs } from "@evolu/common/intl";

const Label = /*#__PURE__*/ minLength(1)(String);

const TypesByLocale = /*#__PURE__*/ localizeTypes(
  { Label },
  {
    cs: {
      MinLength1: cs.formatMinLengthError,
      String: cs.formatStringError,
    },
    en: {
      MinLength1: () => "Text must not be empty.",
      String: () => "The value must be text.",
    },
  },
);

export default (): ReadonlyArray<string> => {
  const invalidType = TypesByLocale.cs.Label.fromUnknown(42);
  const invalidCzechLength = TypesByLocale.cs.Label.fromUnknown("");
  const invalidEnglishLength = TypesByLocale.en.Label.fromUnknown("");

  return [
    invalidType.ok
      ? invalidType.value
      : TypesByLocale.cs.Label.formatError(invalidType.error),
    invalidCzechLength.ok
      ? invalidCzechLength.value
      : TypesByLocale.cs.Label.formatError(invalidCzechLength.error),
    invalidEnglishLength.ok
      ? invalidEnglishLength.value
      : TypesByLocale.en.Label.formatError(invalidEnglishLength.error),
  ];
};
