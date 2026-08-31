/**
 * മലയാളം Evolu Type പിശക് ഫോർമാറ്ററുകൾ.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
  Base64UrlError,
  BetweenError,
  CapitalizedError,
  DateIsoError,
  DateIsoFromDateError,
  DecimalStringError,
  DiscriminatedUnionError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IdError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxLengthError,
  MinLengthError,
  MnemonicError,
  MultipleOfError,
  NegativeDecimalStringError,
  NegativeError,
  NameError,
  NeverError,
  NonNaNError,
  NonNegativeDecimalStringError,
  NonNegativeError,
  NonPositiveDecimalStringError,
  NonPositiveError,
  ObjectError,
  ObjectNotObjectError,
  ObjectPropertyAccessError,
  ObjectTagError,
  ObjectUnexpectedPrototypeError,
  PositiveDecimalStringError,
  PositiveError,
  RecordError,
  RegexError,
  SetError,
  TableIdError,
  TemplateLiteralError,
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  UInt64Error,
  UnionError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();

  return `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു ${typeOf} അല്ല.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `മൂല്യം ${safelyStringifyUnknownValue(reason.value)} ഒരു object അല്ല.`
    : "മൂല്യം ഒരു object ആണ്, എന്നാൽ Object Output ഒരു plain object ആയിരിക്കുകയോ null prototype ഉണ്ടായിരിക്കുകയോ വേണം.";

/** NeverError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} Never type-ന് സാധുവല്ല.`;

/** String TypeOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** TemplateLiteralError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} template literal-നോട് പൊരുത്തപ്പെടുന്നില്ല.`;

/** Number TypeOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** BigInt TypeOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Boolean TypeOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Symbol TypeOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Function TypeOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** EvoluTypeError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഒരു Evolu Type അല്ല.`;

/** ObjectTagError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `മൂല്യമായ ${safelyStringifyUnknownValue(error.value)}-ന് പ്രതീക്ഷിച്ച object tag ${safelyStringifyUnknownValue(error.expected)} ഇല്ല.`;

/** InstanceOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.constructorName}-ന്റെ instance അല്ല.`;

/** LiteralError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} പ്രതീക്ഷിച്ച literal-ന് കൃത്യമായി തുല്യമല്ല: ${String(error.expected)}.`;

/** UnionError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "മൂല്യം അനുവദനീയമായ ഒരു variant-നോടും പൊരുത്തപ്പെടുന്നില്ല.";

/** DateIsoError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} canonical ISO date-time string അല്ല.`;

/** DateIsoFromDateError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-നെ DateIso ആയി പ്രതിനിധീകരിക്കാൻ കഴിയില്ല.";

/** DecimalStringError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} canonical decimal string ആയിരിക്കണം.`;

/** Int64Error മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ signed 64-bit integer (Int64) അല്ല.`;

/** UInt64Error മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ unsigned 64-bit integer (UInt64) അല്ല.`;

/** Int64StringError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Int64 string അല്ല.`;

/** CapitalizedError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} capitalized ആയിരിക്കണം.`;

/** TrimmedError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `മൂല്യമായ ${safelyStringifyUnknownValue(error.value)} trim ചെയ്തതായിരിക്കണം.`;

/** MinLengthError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ നീളം കുറഞ്ഞത് ${error.min} ആയിരിക്കണം.`;

/** MaxLengthError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന്റെ നീളം ${error.max}-ൽ കൂടരുത്.`;

/** LengthError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-ന് ആവശ്യമായ നീളം ${error.exact} ആണ്.`;

/** RegexError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} /${error.source}/${error.flags}-നോട് പൊരുത്തപ്പെടുന്നില്ല.`;

/** Base64UrlError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Base64Url string അല്ല.`;

/** NameError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Name അല്ല.`;

/** MnemonicError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ ഇംഗ്ലീഷ് BIP39 mnemonic അല്ല.`;

/** IdError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} സാധുവായ Id അല്ല.`;

/** TableIdError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} table ${error.table}-നുള്ള സാധുവായ Id അല്ല.`;

/** NonNegativeError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഋണാത്മകമല്ലാതെയായിരിക്കണം (>= 0).`;

/** NonNegativeDecimalStringError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} non-negative decimal string ആയിരിക്കണം.`;

/** PositiveError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ധനാത്മകമായിരിക്കണം (> 0).`;

/** PositiveDecimalStringError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} positive decimal string ആയിരിക്കണം.`;

/** NonPositiveError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ധനാത്മകമല്ലാതെയായിരിക്കണം (<= 0).`;

/** NonPositiveDecimalStringError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} non-positive decimal string ആയിരിക്കണം.`;

/** NegativeError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ഋണാത്മകമായിരിക്കണം (< 0).`;

/** NegativeDecimalStringError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} negative decimal string ആയിരിക്കണം.`;

/** IntError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} safe integer ആയിരിക്കണം.`;

/** GreaterThanError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.min}-നേക്കാൾ വലുതായിരിക്കണം.`;

/** GreaterThanOrEqualToError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.min}-നേക്കാൾ വലുതോ തുല്യമോ ആയിരിക്കണം.`;

/** LessThanError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.max}-നേക്കാൾ ചെറുതായിരിക്കണം.`;

/** LessThanOrEqualToError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.max}-നേക്കാൾ ചെറുതോ തുല്യമോ ആയിരിക്കണം.`;

/** NonNaNError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "മൂല്യം NaN ആയിരിക്കരുത്.";

/** FiniteError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} finite ആയിരിക്കണം.`;

/** MultipleOfError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.divisor}-ന്റെ ഗുണിതമായിരിക്കണം.`;

/** BetweenError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)} ${error.min} നും ${error.max} നും ഇടയിൽ, അതിരുകൾ ഉൾപ്പെടെ, ആയിരിക്കണം.`;

/** ArrayError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു array അല്ല.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-ലെ array element കാണാനില്ല.`;
    case "Accessor":
      return `index ${issue.index}-ലെ array element ഒരു data property ആയിരിക്കണം.`;
    case "ExcessProperty":
      return "അധിക Array property അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Element":
      return `index ${issue.index}-ലെ array element അസാധുവാണ്.`;
  }
};

/** SetError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു Set അല്ല.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `അധിക Set property ${safelyStringifyUnknownValue(issue.key)} അനുവദനീയമല്ല.`;
    case "Element":
      return `index ${issue.index}-ലെ Set element അസാധുവാണ്.`;
  }
};

/** MapError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു Map അല്ല.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `അധിക Map property ${safelyStringifyUnknownValue(issue.key)} അനുവദനീയമല്ല.`;
    case "Key":
    case "Value":
      return `index ${issue.index}-ലെ Map element അസാധുവാണ്.`;
    case "Collision":
      return `Map keys ${safelyStringifyUnknownValue(issue.previousKey)} ഉം ${safelyStringifyUnknownValue(issue.key)} ഉം decode ചെയ്യുമ്പോൾ അതേ key ${safelyStringifyUnknownValue(issue.outputKey)} ലഭിക്കുന്നു.`;
  }
};

/** TupleError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു tuple അല്ല.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple-ൽ കൃത്യമായി ${error.reason.expected} elements ഉണ്ടായിരിക്കണം, എന്നാൽ മൂല്യത്തിൽ ${error.reason.actual} ഉണ്ട്.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index}-ലെ Tuple element കാണാനില്ല.`;
    case "Accessor":
      return `index ${issue.index}-ലെ Tuple element ഒരു data property ആയിരിക്കണം.`;
    case "ExcessProperty":
      return "അധിക Tuple property അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Element":
      return `index ${issue.index}-ലെ Tuple element അസാധുവാണ്.`;
  }
};

/** RecordError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഒരു Record അല്ല.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "മൂല്യം ഒരു object ആണ്, എന്നാൽ Record Output ഒരു plain object ആയിരിക്കുകയോ null prototype ഉണ്ടായിരിക്കുകയോ വേണം.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} അസാധുവാണ്.`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)}-യുടെ മൂല്യം അസാധുവാണ്.`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ഒരു data property ആയിരിക്കണം.`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable ആയിരിക്കണം.`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} ഉം ${safelyStringifyUnknownValue(issue.key)} ഉം decode ചെയ്യുമ്പോൾ അതേ key ${safelyStringifyUnknownValue(issue.outputKey)} ലഭിക്കുന്നു.`;
  }
};

/** ObjectError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties") {
    return formatPlainObjectRootError(error.reason);
  }

  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);

  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Object property ഒരു data property ആയിരിക്കണം. ഈ Type ഉപയോഗിക്കുന്നതിന് മുമ്പ് accessor values-നെ plain data-യിലേക്ക് materialize ചെയ്യുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
      case "NonEnumerable":
        return "Object property enumerable ആയിരിക്കണം. അതിനെ enumerable ആക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `ആവശ്യമായ property ${safelyStringifyUnknownValue(key)} കാണാനില്ല.`;
  }
  if (typeof key === "symbol") {
    return "Object property key ഒരു string ആയിരിക്കണം. symbol property നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} അസാധുവാണ്.`;
};

/** DiscriminatedUnionError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ഒരു data property ആയിരിക്കണം.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} അതിന്റേതായ property ആയിരിക്കണം.`;
      }
      return `${property} enumerable ആയിരിക്കണം.`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}-ന് പ്രതീക്ഷിക്കാത്ത മൂല്യം ${safelyStringifyUnknownValue(error.reason.value)} ഉണ്ട്.`;
    case "Member":
      return `തിരഞ്ഞെടുത്ത variant ${safelyStringifyUnknownValue(error.reason.discriminator)} അസാധുവാണ്.`;
  }
};

/** JsonValueError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `മൂല്യം ${safelyStringifyUnknownValue(issue.value)} ഒരു JSON value അല്ല.`;
    case "NonFiniteNumber":
      return "ഒരു JSON number finite ആയിരിക്കണം.";
    case "UnexpectedPrototype":
      return "മൂല്യം ഒരു object ആണ്, എന്നാൽ JsonValue object ഒരു plain object ആയിരിക്കുകയോ null prototype ഉണ്ടായിരിക്കുകയോ വേണം.";
    case "Accessor":
      return "JSON property ഒരു data property ആയിരിക്കണം. ഈ Type ഉപയോഗിക്കുന്നതിന് മുമ്പ് accessor values-നെ plain data-യിലേക്ക് materialize ചെയ്യുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "NonEnumerable":
      return "JSON object property enumerable ആയിരിക്കണം. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "SymbolProperty":
      return "JSON object property key ഒരു string ആയിരിക്കണം. symbol property നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "Hole":
      return "ഒരു JSON array element കാണാനില്ല.";
    case "ExcessProperty":
      return "അധിക JSON array property അനുവദനീയമല്ല. അത് നീക്കുക അല്ലെങ്കിൽ മറ്റൊരു Type ഉപയോഗിക്കുക.";
    case "CircularReference":
      return "JsonValue-ൽ circular references ഉണ്ടാകരുത്.";
  }
};

/** JsonError മലയാളത്തിൽ ഫോർമാറ്റ് ചെയ്യുന്നു. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `മൂല്യം ${safelyStringifyUnknownValue(error.value)}-നെ JsonValue-ലേക്ക് parse ചെയ്യാൻ കഴിയില്ല.`;
