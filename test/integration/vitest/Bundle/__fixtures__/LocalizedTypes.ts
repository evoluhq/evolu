import {
  String,
  localizeTypes,
  minLength,
} from "../../../../../packages/common/src/Type.ts";
import { cs } from "@evolu/common/intl";

const Label = /*#__PURE__*/ minLength(1)(String);

const typesByLocale = /*#__PURE__*/ localizeTypes(
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
  const invalidType = typesByLocale.cs.Label.fromUnknown(42);
  const invalidCzechLength = typesByLocale.cs.Label.fromUnknown("");
  const invalidEnglishLength = typesByLocale.en.Label.fromUnknown("");

  return [
    invalidType.ok
      ? invalidType.value
      : typesByLocale.cs.Label.formatError(invalidType.error),
    invalidCzechLength.ok
      ? invalidCzechLength.value
      : typesByLocale.cs.Label.formatError(invalidCzechLength.error),
    invalidEnglishLength.ok
      ? invalidEnglishLength.value
      : typesByLocale.en.Label.formatError(invalidEnglishLength.error),
  ];
};
