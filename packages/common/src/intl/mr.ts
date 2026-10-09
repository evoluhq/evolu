/**
 * Marathi Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
  Base64Error,
  Base64UrlError,
  BooleanFromStringError,
  BetweenError,
  IdentifierError,
  CapitalizedError,
  DataError,
  UncapitalizedError,
  UppercasedError,
  LowercasedError,
  DateIsoError,
  DateIsoFromDateError,
  DateIsoFromRfc3339Error,
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EndsWithError,
  EvoluTypeError,
  FiniteError,
  FiniteNumberFromStringError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  HexError,
  HostnameError,
  IbanError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
  IdError,
  Ipv4AddressError,
  Ipv6AddressError,
  Ipv6AddressFromStringError,
  JsonError,
  JsonValueError,
  LengthError,
  LessThanError,
  LessThanOrEqualToError,
  LiteralError,
  MapError,
  MaxEntriesError,
  MaxLengthError,
  MinEntriesError,
  MinLengthError,
  MnemonicError,
  MultipleOfError,
  NegativeDecimalStringError,
  NegativeError,
  NameError,
  NeverError,
  NonEmptyArrayError,
  NonNaNError,
  NonNegativeDecimalStringError,
  NonNegativeError,
  NonPositiveDecimalStringError,
  NonPositiveError,
  NormalizedError,
  ObjectError,
  ObjectNotObjectError,
  ObjectPropertyAccessError,
  ObjectTagError,
  ObjectUnexpectedPrototypeError,
  PhoneNumberE164Error,
  PlainDateIsoError,
  PositiveDecimalStringError,
  PositiveError,
  RecordError,
  RegexError,
  SetError,
  SimplePasswordError,
  TableIdError,
  TemplateLiteralError,
  StartsWithError,
  TrimmedError,
  TupleElementsError,
  TupleError,
  TypeError,
  TypeErrorFormatter,
  TypeOfError,
  TypeValueError,
  UInt64Error,
  UnionError,
  UniqueError,
  UuidError,
  UuidVersionError,
  ValidDateError,
  WellFormedError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();

  return `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${typeOf} नाही.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `मूल्य ${safelyStringifyUnknownValue(reason.value)} हे object नाही.`
    : "मूल्य object आहे, परंतु Object Output हा plain object असला पाहिजे किंवा त्याचा prototype null असला पाहिजे.";

/** Formats a NeverError in Marathi. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे Never प्रकारासाठी वैध नाही.`;

/** Formats a String TypeOfError in Marathi. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Marathi. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे template literal शी जुळत नाही.`;

/** Formats a Number TypeOfError in Marathi. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Marathi. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Marathi. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a BooleanFromStringError in Marathi. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे boolean नाही. true किंवा false वापरा.`;

/** Formats a Symbol TypeOfError in Marathi. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Marathi. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Marathi. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `मूल्य ${safelyStringifyUnknownValue(error.value)} हे Evolu Type नाही.`;

/** Formats an ObjectTagError in Marathi. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} कडे अपेक्षित object tag ${safelyStringifyUnknownValue(error.expected)} नाही.`;

/** Formats a ValidDateError in Marathi. */
export const formatValidDateError: TypeErrorFormatter<ValidDateError> = () =>
  "Date अवैध आहे.";

/** Formats an InstanceOfError in Marathi. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.constructorName} चे instance नाही.`;

/** Formats a LiteralError in Marathi. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे अपेक्षित literal शी काटेकोरपणे समान नाही: ${String(error.expected)}.`;

/** Formats a UnionError in Marathi. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "मूल्य कोणत्याही अनुमत variant शी जुळत नाही.";

/** Formats a DateIsoError in Marathi. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही canonical ISO date-time string नाही.`;

/** Formats a PlainDateIsoError in Marathi. */
export const formatPlainDateIsoError: TypeErrorFormatter<PlainDateIsoError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही YYYY-MM-DD स्वरूपातील वैध कॅलेंडर तारीख नाही.`;

/** Formats a DateIsoFromDateError in Marathi. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date ला DateIso म्हणून दर्शवता येत नाही.";

/** Formats a DateIsoFromRfc3339Error in Marathi. */
export const formatDateIsoFromRfc3339Error: TypeErrorFormatter<
  DateIsoFromRfc3339Error
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे समर्थित RFC 3339 date-time नाही. "2024-01-01T12:00:00Z" सारखे मूल्य वापरा.`;

/** Formats a DecimalStringError in Marathi. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही canonical decimal string असली पाहिजे.`;

/** Formats an Int64Error in Marathi. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा वैध signed 64-bit integer (Int64) नाही.`;

/** Formats a UInt64Error in Marathi. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा वैध unsigned 64-bit integer (UInt64) नाही.`;

/** Formats an Int64StringError in Marathi. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही वैध Int64 string नाही.`;

/** Formats an IdentifierError in Marathi. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.casing} अभिज्ञापक नाही.`;

/** Formats a CapitalizedError in Marathi. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} चे पहिले अक्षर मोठे असले पाहिजे.`;

/** Formats an UncapitalizedError in Marathi. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} मोठ्या अक्षराने सुरू होता कामा नये.`;

/** Formats an UppercasedError in Marathi. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} मोठ्या अक्षरांत असणे आवश्यक आहे.`;

/** Formats a LowercasedError in Marathi. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} लहान अक्षरांत असणे आवश्यक आहे.`;

/** Formats a TrimmedError in Marathi. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} मधील सुरुवातीची आणि शेवटची रिकामी जागा काढलेली असली पाहिजे.`;

/** Formats a WellFormedError in Marathi. */
export const formatWellFormedError: TypeErrorFormatter<WellFormedError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा well-formed Unicode मजकूर असला पाहिजे.`;

/** Formats a NormalizedError in Marathi. */
export const formatNormalizedError: TypeErrorFormatter<NormalizedError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे Unicode सामान्यीकरण रूप ${error.form} मध्ये असले पाहिजे.`;

/** Formats a StartsWithError in Marathi. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ची सुरुवात ${safelyStringifyUnknownValue(error.prefix)} ने होणे आवश्यक आहे.`;

/** Formats an EndsWithError in Marathi. */
export const formatEndsWithError: TypeErrorFormatter<EndsWithError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} चा शेवट ${safelyStringifyUnknownValue(error.suffix)} ने होणे आवश्यक आहे.`;

/** Formats a MinLengthError in Marathi. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} किमान ${error.min} लांबीची अट पूर्ण करत नाही.`;

/** Formats a MaxLengthError in Marathi. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ची लांबी कमाल ${error.max} पेक्षा जास्त आहे.`;

/** Formats a LengthError in Marathi. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ची लांबी नेमकी ${error.exact} असली पाहिजे.`;

/** Formats a RegexError in Marathi. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे /${error.source}/${error.flags} शी जुळत नाही.`;

/** Formats a Base64UrlError in Marathi. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही वैध Base64Url string नाही.`;

/** Formats a Base64Error in Marathi. */
export const formatBase64Error: TypeErrorFormatter<Base64Error> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही वैध Base64 string नाही.`;

/** Formats a HexError in Marathi. */
export const formatHexError: TypeErrorFormatter<HexError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही लहान अक्षरांतील आणि सम संख्येने अंक असलेली hexadecimal string नाही.`;

/** Formats a NameError in Marathi. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे वैध Name नाही.`;

/** Formats an EmailError in Marathi. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा वैध ईमेल पत्ता नाही.`;

/** Formats a HostnameError in Marathi. */
export const formatHostnameError: TypeErrorFormatter<HostnameError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे लहान अक्षरांतील वैध होस्टनेम नाही.`;

/** Formats an Ipv4AddressError in Marathi. */
export const formatIpv4AddressError: TypeErrorFormatter<Ipv4AddressError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा वैध IPv4 पत्ता नाही.`;

/** Formats an Ipv6AddressError in Marathi. */
export const formatIpv6AddressError: TypeErrorFormatter<Ipv6AddressError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा canonical IPv6 पत्ता नाही.`;

/** Formats an Ipv6AddressFromStringError in Marathi. */
export const formatIpv6AddressFromStringError: TypeErrorFormatter<
  Ipv6AddressFromStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा वैध IPv6 पत्ता नाही.`;

/** Formats a PhoneNumberE164Error in Marathi. */
export const formatPhoneNumberE164Error: TypeErrorFormatter<
  PhoneNumberE164Error
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा E.164 स्वरूपातील फोन नंबर नाही.`;

/** Formats an IbanError in Marathi. */
export const formatIbanError: TypeErrorFormatter<IbanError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा मोठ्या अक्षरांतील आणि रिकाम्या जागांशिवाय लिहिलेला वैध IBAN नाही.`;

/** Formats a SimplePasswordError in Marathi. */
export const formatSimplePasswordError: TypeErrorFormatter<
  SimplePasswordError
> = (error) => {
  switch (error.reason) {
    case "Untrimmed":
      return "पासवर्डमधील सुरुवातीची आणि शेवटची रिकामी जागा काढलेली असली पाहिजे.";
    case "TooLong":
      return "पासवर्डची लांबी कमाल 64 पेक्षा जास्त आहे.";
    case "TooShort":
      return "पासवर्ड किमान 8 लांबीची अट पूर्ण करत नाही.";
  }
};

/** Formats a MnemonicError in Marathi. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = () =>
  "मूल्य वैध इंग्रजी BIP39 mnemonic नाही.";

/** Formats an IdError in Marathi. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा वैध Id नाही.`;

/** Formats a TableIdError in Marathi. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा table ${error.table} साठी वैध Id नाही.`;

/** Formats a UuidError in Marathi. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा लहान अक्षरांतील canonical UUID नाही.`;

/** Formats a UuidVersionError in Marathi. */
export const formatUuidVersionError: TypeErrorFormatter<UuidVersionError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा आवृत्ती ${error.version} चा UUID नाही.`;

/** Formats a NonNegativeError in Marathi. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ऋणेतर असले पाहिजे (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Marathi. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही ऋणेतर decimal string असली पाहिजे.`;

/** Formats a PositiveError in Marathi. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} धनात्मक असले पाहिजे (> 0).`;

/** Formats a PositiveDecimalStringError in Marathi. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही धनात्मक decimal string असली पाहिजे.`;

/** Formats a NonPositiveError in Marathi. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} धनात्मक नसले पाहिजे (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Marathi. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही धनात्मक नसलेली decimal string असली पाहिजे.`;

/** Formats a NegativeError in Marathi. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ऋणात्मक असले पाहिजे (< 0).`;

/** Formats a NegativeDecimalStringError in Marathi. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही ऋणात्मक decimal string असली पाहिजे.`;

/** Formats an IntError in Marathi. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हा safe integer असला पाहिजे.`;

/** Formats an IntFromStringError in Marathi. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे दशांश पूर्णांक नाही.`;

/** Formats a FiniteNumberFromStringError in Marathi. */
export const formatFiniteNumberFromStringError: TypeErrorFormatter<
  FiniteNumberFromStringError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही दशांश संख्या नाही.`;

/** Formats a GreaterThanError in Marathi. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.min} पेक्षा मोठे असले पाहिजे.`;

/** Formats a GreaterThanOrEqualToError in Marathi. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.min} पेक्षा मोठे किंवा त्याच्या बरोबर असले पाहिजे.`;

/** Formats a LessThanError in Marathi. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.max} पेक्षा लहान असले पाहिजे.`;

/** Formats a LessThanOrEqualToError in Marathi. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.max} पेक्षा लहान किंवा त्याच्या बरोबर असले पाहिजे.`;

/** Formats a NonNaNError in Marathi. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "मूल्य NaN नसले पाहिजे.";

/** Formats a FiniteError in Marathi. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे मर्यादित असले पाहिजे.`;

/** Formats a MultipleOfError in Marathi. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.divisor} च्या पटीत असले पाहिजे.`;

/** Formats a BetweenError in Marathi. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे ${error.min} आणि ${error.max} दरम्यान, दोन्ही मर्यादांसह, असले पाहिजे.`;

/** Formats an ArrayError in Marathi. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `मूल्य ${safelyStringifyUnknownValue(error.reason.value)} हे array नाही.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} वरील array element गहाळ आहे.`;
    case "Accessor":
      return `index ${issue.index} वरील array element ही data property असली पाहिजे.`;
    case "ExcessProperty":
      return "अतिरिक्त Array property ला अनुमती नाही. ती काढून टाका किंवा वेगळा Type वापरा.";
    case "Element":
      return `index ${issue.index} वरील array element अवैध आहे.`;
  }
};

/** Formats a NonEmptyArrayError in Marathi. */
export const formatNonEmptyArrayError: TypeErrorFormatter<
  NonEmptyArrayError
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} मध्ये किमान एक घटक असला पाहिजे.`;

/** Formats a UniqueError in Marathi. */
export const formatUniqueError: TypeErrorFormatter<UniqueError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} मध्ये index ${error.previousIndex} आणि ${error.index} वर समान घटक आहेत.`;

/** Formats a SetError in Marathi. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `मूल्य ${safelyStringifyUnknownValue(error.reason.value)} हे Set नाही.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `अतिरिक्त Set property ${safelyStringifyUnknownValue(issue.key)} ला अनुमती नाही.`;
    case "Element":
      return `index ${issue.index} वरील Set element अवैध आहे.`;
  }
};

/** Formats a MapError in Marathi. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `मूल्य ${safelyStringifyUnknownValue(error.reason.value)} हे Map नाही.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `अतिरिक्त Map property ${safelyStringifyUnknownValue(issue.key)} ला अनुमती नाही.`;
    case "Key":
      return `index ${issue.index} वरील Map key अवैध आहे.`;
    case "Value":
      return `index ${issue.index} वरील Map मूल्य अवैध आहे.`;
    case "Collision":
      return `index ${issue.previousIndex} आणि ${issue.index} वरील Map keys decode केल्यावर तीच key ${safelyStringifyUnknownValue(issue.outputKey)} मिळते.`;
  }
};

/** Formats a TupleError in Marathi. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `मूल्य ${safelyStringifyUnknownValue(error.reason.value)} हे tuple नाही.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuple ची लांबी ${error.reason.expected} असली पाहिजे, परंतु मूल्याची लांबी ${error.reason.actual} आहे.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `index ${issue.index} वरील Tuple element गहाळ आहे.`;
    case "Accessor":
      return `index ${issue.index} वरील Tuple element ही data property असली पाहिजे.`;
    case "ExcessProperty":
      return "अतिरिक्त Tuple property ला अनुमती नाही. ती काढून टाका किंवा वेगळा Type वापरा.";
    case "Element":
      return `index ${issue.index} वरील Tuple element अवैध आहे.`;
  }
};

/** Formats a RecordError in Marathi. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `मूल्य ${safelyStringifyUnknownValue(error.reason.value)} हे Record नाही.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "मूल्य object आहे, परंतु Record Output हा plain object असला पाहिजे किंवा त्याचा prototype null असला पाहिजे.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Property key ${safelyStringifyUnknownValue(issue.key)} अवैध आहे.`;
    case "Value":
      return `Property ${safelyStringifyUnknownValue(issue.key)} चे मूल्य अवैध आहे.`;
    case "Accessor":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} ही data property असली पाहिजे.`;
    case "NonEnumerable":
      return `Record property ${safelyStringifyUnknownValue(issue.key)} enumerable असली पाहिजे.`;
    case "Collision":
      return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} आणि ${safelyStringifyUnknownValue(issue.key)} decode केल्यावर तीच key ${safelyStringifyUnknownValue(issue.outputKey)} मिळते.`;
  }
};

/** Formats a MinEntriesError in Marathi. */
export const formatMinEntriesError: TypeErrorFormatter<MinEntriesError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} किमान ${error.min} नोंदींची अट पूर्ण करत नाही.`;

/** Formats a MaxEntriesError in Marathi. */
export const formatMaxEntriesError: TypeErrorFormatter<MaxEntriesError> = (
  error,
) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} मधील नोंदींची संख्या कमाल ${error.max} पेक्षा जास्त आहे.`;

/** Formats an ObjectError in Marathi. */
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
        return "Object property ही data property असली पाहिजे. हा Type वापरण्यापूर्वी accessor values चे plain data मध्ये materialize करा किंवा वेगळा Type वापरा.";
      case "NonEnumerable":
        return "Object property enumerable असली पाहिजे. ती enumerable करा किंवा वेगळा Type वापरा.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `आवश्यक property ${safelyStringifyUnknownValue(key)} गहाळ आहे.`;
  }
  if (typeof key === "symbol") {
    return "Object property key ही string असली पाहिजे. symbol property काढून टाका किंवा वेगळा Type वापरा.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Property ${safelyStringifyUnknownValue(key)} ला अनुमती नाही. ती काढून टाका किंवा वेगळा Type वापरा.`;
  }
  return `Property ${safelyStringifyUnknownValue(key)} अवैध आहे.`;
};

/** Formats a DiscriminatedUnionError in Marathi. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} ही data property असली पाहिजे.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} ही स्वतःची property असली पाहिजे.`;
      }
      return `${property} enumerable असली पाहिजे.`;
    }
    case "Discriminator":
      return `Discriminator property ${safelyStringifyUnknownValue(error.reason.key)} चे मूल्य ${safelyStringifyUnknownValue(error.reason.value)} अनपेक्षित आहे.`;
    case "Member":
      return `निवडलेला variant ${safelyStringifyUnknownValue(error.reason.discriminator)} अवैध आहे.`;
  }
};

/** Formats a DataError in Marathi. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `मूल्य ${safelyStringifyUnknownValue(issue.value)} हे Data नाही.`;
    case "UnexpectedPrototype":
      return `Data ${issue.container} चा prototype अनपेक्षित आहे.`;
    case "Accessor":
      return "Data property ही data property असली पाहिजे. हा Type वापरण्यापूर्वी accessor values चे plain data मध्ये materialize करा किंवा वेगळा Type वापरा.";
    case "NonEnumerable":
      return "Data Object property enumerable असली पाहिजे. ती काढून टाका किंवा वेगळा Type वापरा.";
    case "SymbolProperty":
      return "Data Object property key ही string असली पाहिजे. symbol property काढून टाका किंवा वेगळा Type वापरा.";
    case "Hole":
      return "Data Array element गहाळ आहे.";
    case "InvalidUint8Array":
      return "Data Uint8Array चा ArrayBuffer detached नसणे आणि Uint8Array त्या ArrayBuffer च्या मर्यादेत असणे आवश्यक आहे.";
    case "ExcessProperty":
      return `Data ${issue.container} मध्ये अतिरिक्त स्वतःच्या properties नसल्या पाहिजेत. ती property काढून टाका किंवा वेगळा Type वापरा.`;
  }
};

/** Formats a JsonValueError in Marathi. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `मूल्य ${safelyStringifyUnknownValue(issue.value)} हे JSON value नाही.`;
    case "NonFiniteNumber":
      return "JSON number मर्यादित असला पाहिजे.";
    case "UnexpectedPrototype":
      return "मूल्य object आहे, परंतु JsonValue object हा plain object असला पाहिजे किंवा त्याचा prototype null असला पाहिजे.";
    case "Accessor":
      return "JSON property ही data property असली पाहिजे. हा Type वापरण्यापूर्वी accessor values चे plain data मध्ये materialize करा किंवा वेगळा Type वापरा.";
    case "NonEnumerable":
      return "JSON object property enumerable असली पाहिजे. ती काढून टाका किंवा वेगळा Type वापरा.";
    case "SymbolProperty":
      return "JSON object property key ही string असली पाहिजे. symbol property काढून टाका किंवा वेगळा Type वापरा.";
    case "Hole":
      return "JSON array element गहाळ आहे.";
    case "ExcessProperty":
      return "अतिरिक्त JSON array property ला अनुमती नाही. ती काढून टाका किंवा वेगळा Type वापरा.";
    case "CircularReference":
      return "JsonValue मध्ये circular references नसले पाहिजेत.";
  }
};

/** Formats a JsonError in Marathi. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} चे JsonValue मध्ये parsing करता येत नाही.`;

/** Formats a ByteSizeLiteralError in Marathi. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे बाइट आकाराचे literal नाही. "512KiB" किंवा "1MiB" सारखे मूल्य वापरा.`;

/** Formats a ByteLengthError in Marathi. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "मूल्य -0 ही बाइट लांबी नाही. त्याऐवजी 0 वापरा.";

/** Formats a ByteLengthFromStringError in Marathi. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} ही बाइट लांबी नाही. बाइट्सची संख्या किंवा 10MiB सारखे literal वापरा.`;

/** Formats a DurationLiteralError in Marathi. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे कालावधीचे literal नाही. "500ms" किंवा "1.5s" सारखे मूल्य वापरा.`;

/** Formats a PercentageLiteralError in Marathi. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `मूल्य ${safelyStringifyUnknownValue(error.value)} हे टक्केवारीचे literal नाही. "50%" किंवा "12.5%" सारखे मूल्य वापरा.`;
