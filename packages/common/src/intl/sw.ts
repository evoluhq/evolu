/**
 * Swahili Evolu Type error formatters.
 *
 * @module
 */

import { assertNonNullable } from "../Assert.ts";
import { safelyStringifyUnknownValue } from "../String.ts";
import type * as T from "../Type.ts";

const formatTypeOfError = (
  error: T.TypeOfError<
    "String" | "Number" | "BigInt" | "Boolean" | "Symbol" | "Function"
  >,
): string => {
  const typeOf = error.expected.toLowerCase();
  return `Thamani ${safelyStringifyUnknownValue(error.value)} si ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    | T.ObjectNotObjectError["reason"]
    | T.ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Thamani ${safelyStringifyUnknownValue(reason.value)} si kitu.`
    : "Thamani ni kitu, lakini Object Output lazima iwe kitu cha kawaida au iwe na prototaipu null.";

/** Formats a NeverError in Swahili. */
export const formatNeverError: T.TypeErrorFormatter<T.NeverError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si halali kwa aina Never.`;
export const formatStringError: T.TypeErrorFormatter<T.TypeOfError<"String">> =
  formatTypeOfError;
export const formatTemplateLiteralError: T.TypeErrorFormatter<
  T.TemplateLiteralError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} hailingani na template literal.`;
export const formatNumberError: T.TypeErrorFormatter<T.TypeOfError<"Number">> =
  formatTypeOfError;
export const formatBigIntError: T.TypeErrorFormatter<T.TypeOfError<"BigInt">> =
  formatTypeOfError;
export const formatBooleanError: T.TypeErrorFormatter<
  T.TypeOfError<"Boolean">
> = formatTypeOfError;
export const formatSymbolError: T.TypeErrorFormatter<T.TypeOfError<"Symbol">> =
  formatTypeOfError;
export const formatFunctionError: T.TypeErrorFormatter<
  T.TypeOfError<"Function">
> = formatTypeOfError;
export const formatEvoluTypeError: T.TypeErrorFormatter<T.EvoluTypeError> = (
  error,
) => `Thamani ${safelyStringifyUnknownValue(error.value)} si Aina ya Evolu.`;
export const formatObjectTagError: T.TypeErrorFormatter<T.ObjectTagError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haina lebo ya kitu inayotarajiwa ${safelyStringifyUnknownValue(error.expected)}.`;
export const formatInstanceOfError: T.TypeErrorFormatter<T.InstanceOfError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si instance ya ${error.constructorName}.`;
export const formatLiteralError: T.TypeErrorFormatter<T.LiteralError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si sawa kabisa na literal inayotarajiwa: ${globalThis.String(error.expected)}.`;
export const formatUnionError: T.TypeErrorFormatter<T.UnionError> = () =>
  "Thamani hailingani na lahaja yoyote inayoruhusiwa.";
export const formatDateIsoError: T.TypeErrorFormatter<T.DateIsoError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mfuatano wa kanoniki wa tarehe na wakati wa ISO.`;
export const formatDateIsoFromDateError: T.TypeErrorFormatter<
  T.DateIsoFromDateError
> = () => "Date haiwezi kuwakilishwa kama DateIso.";
export const formatDecimalStringError: T.TypeErrorFormatter<
  T.DecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali wa kanoniki.`;
export const formatInt64Error: T.TypeErrorFormatter<T.Int64Error> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si nambari kamili yenye ishara ya biti 64 (Int64) halali.`;
export const formatUInt64Error: T.TypeErrorFormatter<T.UInt64Error> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si nambari kamili isiyo na ishara ya biti 64 (UInt64) halali.`;
export const formatInt64StringError: T.TypeErrorFormatter<
  T.Int64StringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mfuatano halali wa Int64.`;
export const formatCapitalizedError: T.TypeErrorFormatter<
  T.CapitalizedError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima ianze kwa herufi kubwa.`;
export const formatTrimmedError: T.TypeErrorFormatter<T.TrimmedError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima ipunguzwe nafasi za mwanzo na mwisho.`;
export const formatMinLengthError: T.TypeErrorFormatter<T.MinLengthError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haifikii urefu wa chini wa ${error.min}.`;
export const formatMaxLengthError: T.TypeErrorFormatter<T.MaxLengthError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} inazidi urefu wa juu wa ${error.max}.`;
export const formatLengthError: T.TypeErrorFormatter<T.LengthError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haina urefu unaohitajika wa ${error.exact}.`;
export const formatRegexError: T.TypeErrorFormatter<T.RegexError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} hailingani na /${error.source}/${error.flags}.`;
export const formatBase64UrlError: T.TypeErrorFormatter<T.Base64UrlError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mfuatano halali wa Base64Url.`;
export const formatNameError: T.TypeErrorFormatter<T.NameError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si Name halali.`;
export const formatMnemonicError: T.TypeErrorFormatter<T.MnemonicError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si mnemonic halali ya BIP39 ya Kiingereza.`;
export const formatIdError: T.TypeErrorFormatter<T.IdError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si Id halali.`;
export const formatTableIdError: T.TypeErrorFormatter<T.TableIdError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} si Id halali ya jedwali ${error.table}.`;
export const formatNonNegativeError: T.TypeErrorFormatter<
  T.NonNegativeError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima isiwe hasi (>= 0).`;
export const formatNonNegativeDecimalStringError: T.TypeErrorFormatter<
  T.NonNegativeDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali usio hasi.`;
export const formatPositiveError: T.TypeErrorFormatter<T.PositiveError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe chanya (> 0).`;
export const formatPositiveDecimalStringError: T.TypeErrorFormatter<
  T.PositiveDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali chanya.`;
export const formatNonPositiveError: T.TypeErrorFormatter<
  T.NonPositiveError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima isiwe chanya (<= 0).`;
export const formatNonPositiveDecimalStringError: T.TypeErrorFormatter<
  T.NonPositiveDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali usio chanya.`;
export const formatNegativeError: T.TypeErrorFormatter<T.NegativeError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe hasi (< 0).`;
export const formatNegativeDecimalStringError: T.TypeErrorFormatter<
  T.NegativeDecimalStringError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe mfuatano wa desimali hasi.`;
export const formatIntError: T.TypeErrorFormatter<T.IntError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe nambari kamili salama.`;
export const formatGreaterThanError: T.TypeErrorFormatter<
  T.GreaterThanError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kubwa kuliko ${error.min}.`;
export const formatGreaterThanOrEqualToError: T.TypeErrorFormatter<
  T.GreaterThanOrEqualToError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kubwa kuliko au sawa na ${error.min}.`;
export const formatLessThanError: T.TypeErrorFormatter<T.LessThanError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe ndogo kuliko ${error.max}.`;
export const formatLessThanOrEqualToError: T.TypeErrorFormatter<
  T.LessThanOrEqualToError
> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe ndogo kuliko au sawa na ${error.max}.`;
export const formatNonNaNError: T.TypeErrorFormatter<T.NonNaNError> = () =>
  "Thamani lazima isiwe NaN.";
export const formatFiniteError: T.TypeErrorFormatter<T.FiniteError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe yenye kikomo.`;
export const formatMultipleOfError: T.TypeErrorFormatter<T.MultipleOfError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kizidishi cha ${error.divisor}.`;
export const formatBetweenError: T.TypeErrorFormatter<T.BetweenError> = (
  error,
) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} lazima iwe kati ya ${error.min} na ${error.max}, ikijumuisha mipaka.`;

export const formatArrayError: T.TypeErrorFormatter<T.ArrayError> = (error) => {
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
export const formatSetError: T.TypeErrorFormatter<T.SetError> = (error) => {
  if (error.reason.kind === "NotSet")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si Set.`;
  if (error.reason.kind === "UnexpectedPrototype")
    return "Thamani ni instance ya subclass ya Set, lakini Set Output lazima iwe instance ya Set ya moja kwa moja.";
  const issue = error.reason.issues[0];
  switch (issue.kind) {
    case "ExcessProperty":
      return `Sifa ya Set ya ziada ${safelyStringifyUnknownValue(issue.key)} hairuhusiwi.`;
    case "Element":
      return `Kipengele cha Set katika faharasa ${issue.index} si halali.`;
  }
};
export const formatTupleError: T.TypeErrorFormatter<
  T.TupleError | T.TupleElementsError<T.TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray")
    return `Thamani ${safelyStringifyUnknownValue(error.reason.value)} si tuple.`;
  if (error.reason.kind === "InvalidLength")
    return `Tuple lazima iwe na vipengele ${error.reason.expected} hasa, lakini thamani ina ${error.reason.actual}.`;
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
export const formatRecordError: T.TypeErrorFormatter<T.RecordError> = (
  error,
) => {
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
export const formatObjectError: T.TypeErrorFormatter<T.ObjectError> = (
  error,
) => {
  if (error.reason.kind !== "Properties")
    return formatPlainObjectRootError(error.reason);
  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);
  if (propertyError.type === "ObjectPropertyAccess") {
    switch ((propertyError as T.ObjectPropertyAccessError).reason) {
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
export const formatDiscriminatedUnionError: T.TypeErrorFormatter<
  T.DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Sifa ya kibaguzi ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor")
        return `${property} lazima iwe sifa ya data.`;
      if (error.reason.reason === "Inherited")
        return `${property} lazima iwe sifa yake yenyewe.`;
      return `${property} lazima iwe enumerable.`;
    }
    case "Discriminator":
      return `Sifa ya kibaguzi ${safelyStringifyUnknownValue(error.reason.key)} ina thamani isiyotarajiwa ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Lahaja iliyochaguliwa ${safelyStringifyUnknownValue(error.reason.discriminator)} si halali.`;
  }
};
export const formatJsonValueError: T.TypeErrorFormatter<T.JsonValueError> = (
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
export const formatJsonError: T.TypeErrorFormatter<T.JsonError> = (error) =>
  `Thamani ${safelyStringifyUnknownValue(error.value)} haiwezi kuchanganuliwa kuwa JsonValue.`;
