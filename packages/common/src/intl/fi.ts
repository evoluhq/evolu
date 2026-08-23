/**
 * Suomenkieliset Evolu Type -virheiden muotoilijat.
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

  return `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole tyyppiä ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Arvo ${safelyStringifyUnknownValue(reason.value)} ei ole objekti.`
    : "Arvo on objekti, mutta Object Outputin on oltava tavallinen objekti tai sillä on oltava null-prototyyppi.";

/** Muotoilee NeverError-virheen suomeksi. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei kelpaa Never-tyypille.`;

/** Muotoilee String TypeOfError -virheen suomeksi. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Muotoilee TemplateLiteralError-virheen suomeksi. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei vastaa template literal -mallia.`;

/** Muotoilee Number TypeOfError -virheen suomeksi. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Muotoilee BigInt TypeOfError -virheen suomeksi. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Muotoilee Boolean TypeOfError -virheen suomeksi. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Muotoilee Symbol TypeOfError -virheen suomeksi. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Muotoilee Function TypeOfError -virheen suomeksi. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Muotoilee EvoluTypeError-virheen suomeksi. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole Evolu Type.`;

/** Muotoilee ObjectTagError-virheen suomeksi. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Arvolla ${safelyStringifyUnknownValue(error.value)} ei ole odotettua objektitunnistetta ${safelyStringifyUnknownValue(error.expected)}.`;

/** Muotoilee InstanceOfError-virheen suomeksi. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole luokan ${error.constructorName} instanssi.`;

/** Muotoilee LiteralError-virheen suomeksi. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole täsmälleen sama kuin odotettu literaali: ${globalThis.String(error.expected)}.`;

/** Muotoilee UnionError-virheen suomeksi. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Arvo ei vastaa mitään sallittua varianttia.";

/** Muotoilee DateIsoError-virheen suomeksi. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kanoninen ISO-päivämäärä- ja aikamerkkijono.`;

/** Muotoilee DateIsoFromDateError-virheen suomeksi. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Date-arvoa ei voida esittää DateIso-muodossa.";

/** Muotoilee DecimalStringError-virheen suomeksi. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava kanoninen desimaalimerkkijono.`;

/** Muotoilee Int64Error-virheen suomeksi. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen etumerkillinen 64-bittinen kokonaisluku (Int64).`;

/** Muotoilee UInt64Error-virheen suomeksi. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen etumerkitön 64-bittinen kokonaisluku (UInt64).`;

/** Muotoilee Int64StringError-virheen suomeksi. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Int64-merkkijono.`;

/** Muotoilee CapitalizedError-virheen suomeksi. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on alettava isolla kirjaimella.`;

/** Muotoilee TrimmedError-virheen suomeksi. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} alussa tai lopussa ei saa olla tyhjiä merkkejä.`;

/** Muotoilee MinLengthError-virheen suomeksi. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei täytä vähimmäispituutta ${error.min}.`;

/** Muotoilee MaxLengthError-virheen suomeksi. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ylittää enimmäispituuden ${error.max}.`;

/** Muotoilee LengthError-virheen suomeksi. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} pituuden on oltava täsmälleen ${error.exact}.`;

/** Muotoilee RegexError-virheen suomeksi. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei vastaa säännöllistä lauseketta /${error.source}/${error.flags}.`;

/** Muotoilee Base64UrlError-virheen suomeksi. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Base64Url-merkkijono.`;

/** Muotoilee NameError-virheen suomeksi. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Name.`;

/** Muotoilee MnemonicError-virheen suomeksi. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen englanninkielinen BIP39-muistisanasarja.`;

/** Muotoilee IdError-virheen suomeksi. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Id.`;

/** Muotoilee TableIdError-virheen suomeksi. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Arvo ${safelyStringifyUnknownValue(error.value)} ei ole kelvollinen Id taululle ${error.table}.`;

/** Muotoilee NonNegativeError-virheen suomeksi. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava epänegatiivinen (>= 0).`;

/** Muotoilee NonNegativeDecimalStringError-virheen suomeksi. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava epänegatiivinen desimaalimerkkijono.`;

/** Muotoilee PositiveError-virheen suomeksi. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava positiivinen (> 0).`;

/** Muotoilee PositiveDecimalStringError-virheen suomeksi. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava positiivinen desimaalimerkkijono.`;

/** Muotoilee NonPositiveError-virheen suomeksi. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava ei-positiivinen (<= 0).`;

/** Muotoilee NonPositiveDecimalStringError-virheen suomeksi. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava ei-positiivinen desimaalimerkkijono.`;

/** Muotoilee NegativeError-virheen suomeksi. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava negatiivinen (< 0).`;

/** Muotoilee NegativeDecimalStringError-virheen suomeksi. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava negatiivinen desimaalimerkkijono.`;

/** Muotoilee IntError-virheen suomeksi. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava turvallinen kokonaisluku.`;

/** Muotoilee GreaterThanError-virheen suomeksi. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava suurempi kuin ${error.min}.`;

/** Muotoilee GreaterThanOrEqualToError-virheen suomeksi. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava suurempi tai yhtä suuri kuin ${error.min}.`;

/** Muotoilee LessThanError-virheen suomeksi. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava pienempi kuin ${error.max}.`;

/** Muotoilee LessThanOrEqualToError-virheen suomeksi. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava pienempi tai yhtä suuri kuin ${error.max}.`;

/** Muotoilee NonNaNError-virheen suomeksi. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Arvo ei saa olla NaN.";

/** Muotoilee FiniteError-virheen suomeksi. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava äärellinen.`;

/** Muotoilee MultipleOfError-virheen suomeksi. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava luvun ${error.divisor} monikerta.`;

/** Muotoilee BetweenError-virheen suomeksi. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Arvon ${safelyStringifyUnknownValue(error.value)} on oltava välillä ${error.min}–${error.max}, rajat mukaan lukien.`;

/** Muotoilee ArrayError-virheen suomeksi. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole taulukko.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Taulukon indeksistä ${issue.index} puuttuu alkio.`;
    case "Accessor":
      return `Taulukon indeksissä ${issue.index} olevan alkion on oltava dataominaisuus.`;
    case "ExcessProperty":
      return "Ylimääräinen Array-ominaisuus ei ole sallittu. Poista se tai käytä toista Typeä.";
    case "Element":
      return `Taulukon indeksissä ${issue.index} oleva alkio on virheellinen.`;
  }
};

/** Muotoilee SetError-virheen suomeksi. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Ylimääräinen Set-ominaisuus ${safelyStringifyUnknownValue(issue.key)} ei ole sallittu.`;
    case "Element":
      return `Setin indeksissä ${issue.index} oleva alkio on virheellinen.`;
  }
};

/** Muotoilee MapError-virheen suomeksi. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Ylimääräinen Map-ominaisuus ${safelyStringifyUnknownValue(issue.key)} ei ole sallittu.`;
    case "Key":
    case "Value":
      return `Mapin indeksissä ${issue.index} oleva alkio on virheellinen.`;
    case "Collision":
      return `Map-avaimet ${safelyStringifyUnknownValue(issue.previousKey)} ja ${safelyStringifyUnknownValue(issue.key)} dekoodautuvat samaksi avaimeksi ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Muotoilee TupleError-virheen suomeksi. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Tuplen on sisällettävä täsmälleen ${error.reason.expected} alkiota, mutta arvo sisältää ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Tuplen indeksistä ${issue.index} puuttuu alkio.`;
    case "Accessor":
      return `Tuplen indeksissä ${issue.index} olevan alkion on oltava dataominaisuus.`;
    case "ExcessProperty":
      return "Ylimääräinen Tuple-ominaisuus ei ole sallittu. Poista se tai käytä toista Typeä.";
    case "Element":
      return `Tuplen indeksissä ${issue.index} oleva alkio on virheellinen.`;
  }
};

/** Muotoilee RecordError-virheen suomeksi. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Arvo ${safelyStringifyUnknownValue(error.reason.value)} ei ole Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Arvo on objekti, mutta Record Outputin on oltava tavallinen objekti tai sillä on oltava null-prototyyppi.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Ominaisuusavain ${safelyStringifyUnknownValue(issue.key)} on virheellinen.`;
    case "Value":
      return `Ominaisuuden ${safelyStringifyUnknownValue(issue.key)} arvo on virheellinen.`;
    case "Accessor":
      return `Record-ominaisuuden ${safelyStringifyUnknownValue(issue.key)} on oltava dataominaisuus.`;
    case "NonEnumerable":
      return `Record-ominaisuuden ${safelyStringifyUnknownValue(issue.key)} on oltava lueteltava.`;
    case "Collision":
      return `Record-avaimet ${safelyStringifyUnknownValue(issue.previousKey)} ja ${safelyStringifyUnknownValue(issue.key)} dekoodautuvat samaksi avaimeksi ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Muotoilee ObjectError-virheen suomeksi. */
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
        return "Object-ominaisuuden on oltava dataominaisuus. Muunna accessor-arvot tavalliseksi dataksi ennen tämän Typen käyttöä tai käytä toista Typeä.";
      case "NonEnumerable":
        return "Object-ominaisuuden on oltava lueteltava. Tee siitä lueteltava tai käytä toista Typeä.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Pakollinen ominaisuus ${safelyStringifyUnknownValue(key)} puuttuu.`;
  }
  if (typeof key === "symbol") {
    return "Object-ominaisuuden avaimen on oltava merkkijono. Poista symboliominaisuus tai käytä toista Typeä.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Ominaisuus ${safelyStringifyUnknownValue(key)} ei ole sallittu. Poista se tai käytä toista Typeä.`;
  }
  return `Ominaisuus ${safelyStringifyUnknownValue(key)} on virheellinen.`;
};

/** Muotoilee DiscriminatedUnionError-virheen suomeksi. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Diskriminaattoriominaisuuden ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} on oltava dataominaisuus.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} on oltava objektin oma ominaisuus.`;
      }
      return `${property} on oltava lueteltava.`;
    }
    case "Discriminator":
      return `Diskriminaattoriominaisuudella ${safelyStringifyUnknownValue(error.reason.key)} on odottamaton arvo ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Valittu variantti ${safelyStringifyUnknownValue(error.reason.discriminator)} on virheellinen.`;
  }
};

/** Muotoilee JsonValueError-virheen suomeksi. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Arvo ${safelyStringifyUnknownValue(issue.value)} ei ole JSON-arvo.`;
    case "NonFiniteNumber":
      return "JSON-luvun on oltava äärellinen.";
    case "UnexpectedPrototype":
      return "Arvo on objekti, mutta JsonValue-objektin on oltava tavallinen objekti tai sillä on oltava null-prototyyppi.";
    case "Accessor":
      return "JSON-ominaisuuden on oltava dataominaisuus. Muunna accessor-arvot tavalliseksi dataksi ennen tämän Typen käyttöä tai käytä toista Typeä.";
    case "NonEnumerable":
      return "JSON-objektin ominaisuuden on oltava lueteltava. Poista se tai käytä toista Typeä.";
    case "SymbolProperty":
      return "JSON-objektin ominaisuusavaimen on oltava merkkijono. Poista symboliominaisuus tai käytä toista Typeä.";
    case "Hole":
      return "JSON-taulukosta puuttuu alkio.";
    case "ExcessProperty":
      return "Ylimääräinen JSON-taulukon ominaisuus ei ole sallittu. Poista se tai käytä toista Typeä.";
    case "CircularReference":
      return "JsonValue ei saa sisältää syklisiä viittauksia.";
  }
};

/** Muotoilee JsonError-virheen suomeksi. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Arvoa ${safelyStringifyUnknownValue(error.value)} ei voida jäsentää JsonValue-arvoksi.`;
