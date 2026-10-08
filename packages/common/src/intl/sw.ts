/**
 * Swahili Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type {
  ArrayError,
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
  DecimalStringError,
  DiscriminatedUnionError,
  EmailError,
  EvoluTypeError,
  FiniteError,
  GreaterThanError,
  GreaterThanOrEqualToError,
  InstanceOfError,
  Int64Error,
  Int64StringError,
  IntError,
  IntFromStringError,
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
  UuidError,
} from "../Type.ts";

const formatTypeOfError = (
  error: TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();
  return `Thamani ${safelyStringifyUnknownValue(error.value)} si ya aina ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Thamani ${safelyStringifyUnknownValue(reason.value)} si kitu (object).`
    : "Thamani ni kitu, lakini Object Output lazima iwe kitu cha kawaida au iwe na prototaipu null.";

/** Formats a NeverError in Swahili. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si halali kwa aina Never.`;
/** Formats a String TypeOfError in Swahili. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;
/** Formats a TemplateLiteralError in Swahili. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} hailingani na literali ya kiolezo.`;
/** Formats a Number TypeOfError in Swahili. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;
/** Formats a BigInt TypeOfError in Swahili. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;
/** Formats a Boolean TypeOfError in Swahili. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;
/** Formats a Symbol TypeOfError in Swahili. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;
/** Formats a Function TypeOfError in Swahili. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;
/** Formats an EvoluTypeError in Swahili. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Thamani ${safelyStringifyUnknownValue(error.value)} si Aina ya Evolu.`;
/** Formats an ObjectTagError in Swahili. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haina lebo ya kitu inayotarajiwa ${safelyStringifyUnknownValue(error.expected)}.`;
/** Formats an InstanceOfError in Swahili. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si instance ya ${error.constructorName}.`;
/** Formats a LiteralError in Swahili. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si sawa kabisa na literali inayotarajiwa: ${String(error.expected)}.`;
/** Formats a UnionError in Swahili. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Thamani hailingani na lahaja yoyote inayoruhusiwa.";
/** Formats a DateIsoError in Swahili. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mfuatano wa kanoniki wa tarehe na wakati wa ISO.`;
/** Formats a DateIsoFromDateError in Swahili. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date haiwezi kuwakilishwa kama DateIso.";
/** Formats a DecimalStringError in Swahili. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali wa kanoniki.`;
/** Formats an Int64Error in Swahili. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si nambari kamili yenye ishara ya biti 64 (Int64) halali.`;
/** Formats a UInt64Error in Swahili. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si nambari kamili isiyo na ishara ya biti 64 (UInt64) halali.`;
/** Formats an Int64StringError in Swahili. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mfuatano halali wa Int64.`;

/** Formats an IdentifierError in Swahili. */
export const formatIdentifierError: TypeErrorFormatter<IdentifierError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si kitambulishi cha ${error.casing}.`;

/** Formats a CapitalizedError in Swahili. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima ianze kwa herufi kubwa.`;

/** Formats an UncapitalizedError in Swahili. */
export const formatUncapitalizedError: TypeErrorFormatter<
  UncapitalizedError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haipaswi kuanza kwa herufi kubwa.`;

/** Formats an UppercasedError in Swahili. */
export const formatUppercasedError: TypeErrorFormatter<UppercasedError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe katika herufi kubwa.`;

/** Formats a LowercasedError in Swahili. */
export const formatLowercasedError: TypeErrorFormatter<LowercasedError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe katika herufi ndogo.`;
/** Formats a TrimmedError in Swahili. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima isiwe na nafasi mwanzoni wala mwishoni.`;
/** Formats a StartsWithError in Swahili. */
export const formatStartsWithError: TypeErrorFormatter<StartsWithError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima ianze na ${safelyStringifyUnknownValue(error.prefix)}.`;

/** Formats a MinLengthError in Swahili. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haifikii urefu wa chini wa ${error.min}.`;
/** Formats a MaxLengthError in Swahili. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} inazidi urefu wa juu wa ${error.max}.`;
/** Formats a LengthError in Swahili. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haina urefu unaohitajika wa ${error.exact}.`;
/** Formats a RegexError in Swahili. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} hailingani na /${error.source}/${error.flags}.`;
/** Formats a Base64UrlError in Swahili. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mfuatano halali wa Base64Url.`;
/** Formats a NameError in Swahili. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si Name halali.`;
/** Formats an EmailError in Swahili. */
export const formatEmailError: TypeErrorFormatter<EmailError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si anwani halali ya barua pepe.`;
/** Formats a MnemonicError in Swahili. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mnemonic halali ya BIP39 ya Kiingereza.`;
/** Formats an IdError in Swahili. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si Id halali.`;
/** Formats a TableIdError in Swahili. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si Id halali ya jedwali ${error.table}.`;
/** Formats a UuidError in Swahili. */
export const formatUuidError: TypeErrorFormatter<UuidError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si UUID ya kanoniki yenye herufi ndogo.`;
/** Formats a NonNegativeError in Swahili. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima isiwe hasi (>= 0).`;
/** Formats a NonNegativeDecimalStringError in Swahili. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali usio hasi.`;
/** Formats a PositiveError in Swahili. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe chanya (> 0).`;
/** Formats a PositiveDecimalStringError in Swahili. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali chanya.`;
/** Formats a NonPositiveError in Swahili. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima isiwe chanya (<= 0).`;
/** Formats a NonPositiveDecimalStringError in Swahili. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali usio chanya.`;
/** Formats a NegativeError in Swahili. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe hasi (< 0).`;
/** Formats a NegativeDecimalStringError in Swahili. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali hasi.`;
/** Formats an IntError in Swahili. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe nambari kamili salama.`;
/** Formats a GreaterThanError in Swahili. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kubwa kuliko ${error.min}.`;
/** Formats a GreaterThanOrEqualToError in Swahili. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kubwa kuliko au sawa na ${error.min}.`;
/** Formats a LessThanError in Swahili. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe ndogo kuliko ${error.max}.`;
/** Formats a LessThanOrEqualToError in Swahili. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe ndogo kuliko au sawa na ${error.max}.`;
/** Formats a NonNaNError in Swahili. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Thamani lazima isiwe NaN.";
/** Formats a FiniteError in Swahili. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe yenye kikomo.`;
/** Formats a MultipleOfError in Swahili. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kigawe cha ${error.divisor}.`;
/** Formats a BetweenError in Swahili. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kati ya ${error.min} na ${error.max}, ikijumuisha mipaka.`;

/** Formats a BooleanFromStringError in Swahili. */
export const formatBooleanFromStringError: TypeErrorFormatter<
  BooleanFromStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si thamani ya boolean. Tumia true au false.`;

/** Formats an IntFromStringError in Swahili. */
export const formatIntFromStringError: TypeErrorFormatter<
  IntFromStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si nambari kamili ya desimali.`;

/** Formats an ArrayError in Swahili. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si array.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Kipengele cha array katika faharasa ${issue.index} hakipo.`;
    case "Accessor":
      return `Kipengele cha array katika faharasa ${issue.index} lazima kiwe sifa ya data.`;
    case "ExcessProperty":
      return "Sifa ya Array ya ziada hairuhusiwi. Iondoe au utumie Aina tofauti.";
    case "Element":
      return `Kipengele cha array katika faharasa ${issue.index} si halali.`;
  }
};
/** Formats a SetError in Swahili. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si Set.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Sifa ya Set ya ziada ${safelyStringifyUnknownValue(issue.key)} hairuhusiwi.`;
    case "Element":
      return `Kipengele cha Set katika faharasa ${issue.index} si halali.`;
  }
};

/** Formats a MapError in Swahili. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si Map.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Sifa ya Map ya ziada ${safelyStringifyUnknownValue(issue.key)} hairuhusiwi.`;
    case "Key":
      return `Ufunguo wa Map katika faharasa ${issue.index} si halali.`;
    case "Value":
      return `Thamani ya Map katika faharasa ${issue.index} si halali.`;
    case "Collision":
      return `Funguo za Map katika faharasa ${issue.previousIndex} na ${issue.index} zinafumbuliwa kuwa ufunguo uleule ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};
/** Formats a TupleError in Swahili. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si tuple.`;
  if (error.reason.kind === "InvalidLength")
    return `Tuple lazima iwe na urefu wa ${error.reason.expected}, lakini thamani ina urefu wa ${error.reason.actual}.`;
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Hole":
      return `Kipengele cha Tuple katika faharasa ${issue.index} hakipo.`;
    case "Accessor":
      return `Kipengele cha Tuple katika faharasa ${issue.index} lazima kiwe sifa ya data.`;
    case "ExcessProperty":
      return "Sifa ya Tuple ya ziada hairuhusiwi. Iondoe au utumie Aina tofauti.";
    case "Element":
      return `Kipengele cha Tuple katika faharasa ${issue.index} si halali.`;
  }
};
/** Formats a RecordError in Swahili. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si Record.`;
  if (error.reason.kind === "NotPlainRecord")
    return "Thamani ni kitu, lakini Record Output lazima iwe kitu cha kawaida au iwe na prototaipu null.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "Key":
      return `Ufunguo wa sifa ${safelyStringifyUnknownValue(issue.key)} si halali.`;
    case "Value":
      return `Thamani ya sifa ${safelyStringifyUnknownValue(issue.key)} si halali.`;
    case "Accessor":
      return `Sifa ya Record ${safelyStringifyUnknownValue(issue.key)} lazima iwe sifa ya data.`;
    case "NonEnumerable":
      return `Sifa ya Record ${safelyStringifyUnknownValue(issue.key)} lazima iwe enumerable.`;
    case "Collision":
      return `Funguo za Record ${safelyStringifyUnknownValue(issue.previousKey)} na ${safelyStringifyUnknownValue(issue.key)} zinafumbuliwa kuwa ufunguo uleule ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};
/** Formats an ObjectError in Swahili. */
export const formatObjectError: TypeErrorFormatter<ObjectError> = (error) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as ObjectPropertyAccessError).reason) {
      case "Accessor":
        return "Sifa ya Object lazima iwe sifa ya data. Badilisha thamani za accessor kuwa data ya kawaida kabla ya kutumia Aina hii au utumie Aina tofauti.";
      case "NonEnumerable":
        return "Sifa ya Object lazima iwe enumerable. Ifanye enumerable au utumie Aina tofauti.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty")
    return `Sifa inayohitajika ${safelyStringifyUnknownValue(key)} haipo.`;
  if (typeof key === "symbol")
    return "Ufunguo wa sifa ya Object lazima uwe mfuatano. Ondoa sifa ya symbol au utumie Aina tofauti.";
  if (propertyError.type === "ObjectExcessProperty")
    return `Sifa ${safelyStringifyUnknownValue(key)} hairuhusiwi. Iondoe au utumie Aina tofauti.`;
  return `Sifa ${safelyStringifyUnknownValue(key)} si halali.`;
};
/** Formats a DiscriminatedUnionError in Swahili. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Sifa bainishi ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} lazima iwe sifa ya data.`;
      if (error.reason.reason === "Inherited")
        return `${property} lazima iwe sifa yake yenyewe.`;
      return `${property} lazima iwe enumerable.`;
    }
    case "Discriminator":
      return `Sifa bainishi ${safelyStringifyUnknownValue(error.reason.key)} ina thamani isiyotarajiwa ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Lahaja iliyochaguliwa ${safelyStringifyUnknownValue(error.reason.discriminator)} si halali.`;
  }
};
/** Formats a DataError in Swahili. */
export const formatDataError: TypeErrorFormatter<DataError> = (error) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Thamani ${safelyStringifyUnknownValue(issue.value)} si Data.`;
    case "UnexpectedPrototype":
      return `${issue.container} ya Data ina prototaipu isiyotarajiwa.`;
    case "Accessor":
      return "Sifa ya Data lazima iwe sifa ya data. Badilisha thamani za accessor kuwa data ya kawaida kabla ya kutumia Aina hii au utumie Aina tofauti.";
    case "NonEnumerable":
      return "Sifa ya Object ya Data lazima iwe enumerable. Iondoe au utumie Aina tofauti.";
    case "SymbolProperty":
      return "Ufunguo wa sifa ya Object ya Data lazima uwe mfuatano. Ondoa sifa ya symbol au utumie Aina tofauti.";
    case "Hole":
      return "Kipengele cha Array ya Data hakipo.";
    case "InvalidUint8Array":
      return "Uint8Array ya Data lazima iwe na ArrayBuffer ambayo haijatenganishwa, na lazima iwe ndani ya mipaka ya ArrayBuffer hiyo.";
    case "ExcessProperty":
      return `${issue.container} ya Data haipaswi kuwa na sifa zake zenyewe za ziada. Ondoa sifa hiyo au utumie Aina tofauti.`;
  }
};

/** Formats a JsonValueError in Swahili. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "InvalidType":
      return `Thamani ${safelyStringifyUnknownValue(issue.value)} si thamani ya JSON.`;
    case "NonFiniteNumber":
      return "Nambari ya JSON lazima iwe yenye kikomo.";
    case "UnexpectedPrototype":
      return "Thamani ni kitu, lakini kitu cha JsonValue lazima kiwe kitu cha kawaida au kiwe na prototaipu null.";
    case "Accessor":
      return "Sifa ya JSON lazima iwe sifa ya data. Badilisha thamani za accessor kuwa data ya kawaida kabla ya kutumia Aina hii au utumie Aina tofauti.";
    case "NonEnumerable":
      return "Sifa ya kitu cha JSON lazima iwe enumerable. Iondoe au utumie Aina tofauti.";
    case "SymbolProperty":
      return "Ufunguo wa sifa ya kitu cha JSON lazima uwe mfuatano. Ondoa sifa ya symbol au utumie Aina tofauti.";
    case "Hole":
      return "Kipengele cha array ya JSON hakipo.";
    case "ExcessProperty":
      return "Sifa ya array ya JSON ya ziada hairuhusiwi. Iondoe au utumie Aina tofauti.";
    case "CircularReference":
      return "JsonValue haipaswi kuwa na marejeleo ya mviringo.";
  }
};
/** Formats a JsonError in Swahili. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haiwezi kuchanganuliwa kuwa JsonValue.`;

/** Formats a ByteSizeLiteralError in Swahili. */
export const formatByteSizeLiteralError: TypeErrorFormatter<
  TypeValueError<"ByteSizeLiteral">
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si literali ya ukubwa kwa baiti. Tumia thamani kama "512KiB" au "1MiB".`;

/** Formats a ByteLengthError in Swahili. */
export const formatByteLengthError: TypeErrorFormatter<
  TypeValueError<"ByteLength">
> = () => "Thamani -0 si urefu kwa baiti. Tumia 0 badala yake.";

/** Formats a ByteLengthFromStringError in Swahili. */
export const formatByteLengthFromStringError: TypeErrorFormatter<
  TypeValueError<"ByteLengthFromString">
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si urefu kwa baiti. Tumia idadi ya baiti au literali kama 10MiB.`;

/** Formats a DurationLiteralError in Swahili. */
export const formatDurationLiteralError: TypeErrorFormatter<
  TypeValueError<"DurationLiteral">
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si literali ya muda. Tumia thamani kama "500ms" au "1.5s".`;

/** Formats a PercentageLiteralError in Swahili. */
export const formatPercentageLiteralError: TypeErrorFormatter<
  TypeValueError<"PercentageLiteral">
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si literali ya asilimia. Tumia thamani kama "50%" au "12.5%".`;
