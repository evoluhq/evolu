/**
 * Greek Evolu Type error formatters.
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
  const typeOf = {
    String: "συμβολοσειρά",
    Number: "αριθμός",
    BigInt: "BigInt",
    Boolean: "λογική τιμή",
    Symbol: "σύμβολο",
    Function: "συνάρτηση",
  }[error.expected];

  return `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι ${typeOf}.`;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `Η τιμή ${safelyStringifyUnknownValue(reason.value)} δεν είναι αντικείμενο.`
    : "Η τιμή είναι αντικείμενο, αλλά ένα Object Output πρέπει να είναι απλό αντικείμενο ή να έχει πρωτότυπο null.";

/** Formats a NeverError in Greek. */
export const formatNeverError: TypeErrorFormatter<NeverError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρη για τον τύπο Never.`;

/** Formats a String TypeOfError in Greek. */
export const formatStringError: TypeErrorFormatter<TypeOfError<"String">> =
  formatTypeOfError;

/** Formats a TemplateLiteralError in Greek. */
export const formatTemplateLiteralError: TypeErrorFormatter<
  TemplateLiteralError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν ταιριάζει με το πρότυπο literal.`;

/** Formats a Number TypeOfError in Greek. */
export const formatNumberError: TypeErrorFormatter<TypeOfError<"Number">> =
  formatTypeOfError;

/** Formats a BigInt TypeOfError in Greek. */
export const formatBigIntError: TypeErrorFormatter<TypeOfError<"BigInt">> =
  formatTypeOfError;

/** Formats a Boolean TypeOfError in Greek. */
export const formatBooleanError: TypeErrorFormatter<TypeOfError<"Boolean">> =
  formatTypeOfError;

/** Formats a Symbol TypeOfError in Greek. */
export const formatSymbolError: TypeErrorFormatter<TypeOfError<"Symbol">> =
  formatTypeOfError;

/** Formats a Function TypeOfError in Greek. */
export const formatFunctionError: TypeErrorFormatter<TypeOfError<"Function">> =
  formatTypeOfError;

/** Formats an EvoluTypeError in Greek. */
export const formatEvoluTypeError: TypeErrorFormatter<EvoluTypeError> = (
  error,
) => `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι Evolu Type.`;

/** Formats an ObjectTagError in Greek. */
export const formatObjectTagError: TypeErrorFormatter<ObjectTagError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν έχει την αναμενόμενη ετικέτα αντικειμένου ${safelyStringifyUnknownValue(error.expected)}.`;

/** Formats an InstanceOfError in Greek. */
export const formatInstanceOfError: TypeErrorFormatter<InstanceOfError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι στιγμιότυπο του ${error.constructorName}.`;

/** Formats a LiteralError in Greek. */
export const formatLiteralError: TypeErrorFormatter<LiteralError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι αυστηρά ίση με το αναμενόμενο literal: ${globalThis.String(error.expected)}.`;

/** Formats a UnionError in Greek. */
export const formatUnionError: TypeErrorFormatter<UnionError> = () =>
  "Η τιμή δεν ταιριάζει με καμία από τις επιτρεπόμενες παραλλαγές.";

/** Formats a DateIsoError in Greek. */
export const formatDateIsoError: TypeErrorFormatter<DateIsoError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι κανονική συμβολοσειρά ημερομηνίας και ώρας ISO.`;

/** Formats a DateIsoFromDateError in Greek. */
export const formatDateIsoFromDateError: TypeErrorFormatter<
  DateIsoFromDateError
> = () => "Το Date δεν μπορεί να αναπαρασταθεί ως DateIso.";

/** Formats a DecimalStringError in Greek. */
export const formatDecimalStringError: TypeErrorFormatter<
  DecimalStringError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι κανονική δεκαδική συμβολοσειρά.`;

/** Formats an Int64Error in Greek. */
export const formatInt64Error: TypeErrorFormatter<Int64Error> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρος προσημασμένος ακέραιος 64 bit (Int64).`;

/** Formats a UInt64Error in Greek. */
export const formatUInt64Error: TypeErrorFormatter<UInt64Error> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρος ακέραιος 64 bit χωρίς πρόσημο (UInt64).`;

/** Formats an Int64StringError in Greek. */
export const formatInt64StringError: TypeErrorFormatter<Int64StringError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρη συμβολοσειρά Int64.`;

/** Formats a CapitalizedError in Greek. */
export const formatCapitalizedError: TypeErrorFormatter<CapitalizedError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να αρχίζει με κεφαλαίο γράμμα.`;

/** Formats a TrimmedError in Greek. */
export const formatTrimmedError: TypeErrorFormatter<TrimmedError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να μην έχει κενά στην αρχή ή στο τέλος.`;

/** Formats a MinLengthError in Greek. */
export const formatMinLengthError: TypeErrorFormatter<MinLengthError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν πληροί το ελάχιστο μήκος ${error.min}.`;

/** Formats a MaxLengthError in Greek. */
export const formatMaxLengthError: TypeErrorFormatter<MaxLengthError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} υπερβαίνει το μέγιστο μήκος ${error.max}.`;

/** Formats a LengthError in Greek. */
export const formatLengthError: TypeErrorFormatter<LengthError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν έχει το απαιτούμενο μήκος ${error.exact}.`;

/** Formats a RegexError in Greek. */
export const formatRegexError: TypeErrorFormatter<RegexError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν ταιριάζει με το /${error.source}/${error.flags}.`;

/** Formats a Base64UrlError in Greek. */
export const formatBase64UrlError: TypeErrorFormatter<Base64UrlError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρη συμβολοσειρά Base64Url.`;

/** Formats a NameError in Greek. */
export const formatNameError: TypeErrorFormatter<NameError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρο Name.`;

/** Formats a MnemonicError in Greek. */
export const formatMnemonicError: TypeErrorFormatter<MnemonicError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρη αγγλική μνημονική φράση BIP39.`;

/** Formats an IdError in Greek. */
export const formatIdError: TypeErrorFormatter<IdError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρο Id.`;

/** Formats a TableIdError in Greek. */
export const formatTableIdError: TypeErrorFormatter<TableIdError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν είναι έγκυρο Id για τον πίνακα ${error.table}.`;

/** Formats a NonNegativeError in Greek. */
export const formatNonNegativeError: TypeErrorFormatter<NonNegativeError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μη αρνητική (>= 0).`;

/** Formats a NonNegativeDecimalStringError in Greek. */
export const formatNonNegativeDecimalStringError: TypeErrorFormatter<
  NonNegativeDecimalStringError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μη αρνητική δεκαδική συμβολοσειρά.`;

/** Formats a PositiveError in Greek. */
export const formatPositiveError: TypeErrorFormatter<PositiveError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι θετική (> 0).`;

/** Formats a PositiveDecimalStringError in Greek. */
export const formatPositiveDecimalStringError: TypeErrorFormatter<
  PositiveDecimalStringError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι θετική δεκαδική συμβολοσειρά.`;

/** Formats a NonPositiveError in Greek. */
export const formatNonPositiveError: TypeErrorFormatter<NonPositiveError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μη θετική (<= 0).`;

/** Formats a NonPositiveDecimalStringError in Greek. */
export const formatNonPositiveDecimalStringError: TypeErrorFormatter<
  NonPositiveDecimalStringError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μη θετική δεκαδική συμβολοσειρά.`;

/** Formats a NegativeError in Greek. */
export const formatNegativeError: TypeErrorFormatter<NegativeError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι αρνητική (< 0).`;

/** Formats a NegativeDecimalStringError in Greek. */
export const formatNegativeDecimalStringError: TypeErrorFormatter<
  NegativeDecimalStringError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι αρνητική δεκαδική συμβολοσειρά.`;

/** Formats an IntError in Greek. */
export const formatIntError: TypeErrorFormatter<IntError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι ασφαλής ακέραιος.`;

/** Formats a GreaterThanError in Greek. */
export const formatGreaterThanError: TypeErrorFormatter<GreaterThanError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μεγαλύτερη από ${error.min}.`;

/** Formats a GreaterThanOrEqualToError in Greek. */
export const formatGreaterThanOrEqualToError: TypeErrorFormatter<
  GreaterThanOrEqualToError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μεγαλύτερη ή ίση με ${error.min}.`;

/** Formats a LessThanError in Greek. */
export const formatLessThanError: TypeErrorFormatter<LessThanError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μικρότερη από ${error.max}.`;

/** Formats a LessThanOrEqualToError in Greek. */
export const formatLessThanOrEqualToError: TypeErrorFormatter<
  LessThanOrEqualToError
> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μικρότερη ή ίση με ${error.max}.`;

/** Formats a NonNaNError in Greek. */
export const formatNonNaNError: TypeErrorFormatter<NonNaNError> = () =>
  "Η τιμή δεν πρέπει να είναι NaN.";

/** Formats a FiniteError in Greek. */
export const formatFiniteError: TypeErrorFormatter<FiniteError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι πεπερασμένη.`;

/** Formats a MultipleOfError in Greek. */
export const formatMultipleOfError: TypeErrorFormatter<MultipleOfError> = (
  error,
) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι πολλαπλάσιο του ${error.divisor}.`;

/** Formats a BetweenError in Greek. */
export const formatBetweenError: TypeErrorFormatter<BetweenError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} πρέπει να είναι μεταξύ ${error.min} και ${error.max}, συμπεριλαμβανομένων.`;

/** Formats an ArrayError in Greek. */
export const formatArrayError: TypeErrorFormatter<ArrayError> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Η τιμή ${safelyStringifyUnknownValue(error.reason.value)} δεν είναι πίνακας.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Λείπει ένα στοιχείο πίνακα στη θέση ${issue.index}.`;
    case "Accessor":
      return `Το στοιχείο πίνακα στη θέση ${issue.index} πρέπει να είναι ιδιότητα δεδομένων.`;
    case "ExcessProperty":
      return "Δεν επιτρέπεται επιπλέον ιδιότητα Array. Αφαιρέστε την ή χρησιμοποιήστε διαφορετικό Type.";
    case "Element":
      return `Το στοιχείο πίνακα στη θέση ${issue.index} δεν είναι έγκυρο.`;
  }
};

/** Formats a SetError in Greek. */
export const formatSetError: TypeErrorFormatter<SetError> = (error) => {
  if (error.reason.kind === "NotSet") {
    return `Η τιμή ${safelyStringifyUnknownValue(error.reason.value)} δεν είναι Set.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Δεν επιτρέπεται επιπλέον ιδιότητα Set ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Element":
      return `Το στοιχείο Set στη θέση ${issue.index} δεν είναι έγκυρο.`;
  }
};

/** Formats a MapError in Greek. */
export const formatMapError: TypeErrorFormatter<MapError> = (error) => {
  if (error.reason.kind === "NotMap") {
    return `Η τιμή ${safelyStringifyUnknownValue(error.reason.value)} δεν είναι Map.`;
  }
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "ExcessProperty":
      return `Δεν επιτρέπεται επιπλέον ιδιότητα Map ${safelyStringifyUnknownValue(issue.key)}.`;
    case "Key":
    case "Value":
      return `Το στοιχείο Map στη θέση ${issue.index} δεν είναι έγκυρο.`;
    case "Collision":
      return `Τα κλειδιά Map ${safelyStringifyUnknownValue(issue.previousKey)} και ${safelyStringifyUnknownValue(issue.key)} αποκωδικοποιούνται στο ίδιο κλειδί ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats a TupleError in Greek. */
export const formatTupleError: TypeErrorFormatter<
  TupleError | TupleElementsError<TypeError>
> = (error) => {
  if (error.reason.kind === "NotArray") {
    return `Η τιμή ${safelyStringifyUnknownValue(error.reason.value)} δεν είναι tuple.`;
  }
  if (error.reason.kind === "InvalidLength") {
    return `Ένα Tuple πρέπει να περιέχει ακριβώς ${error.reason.expected} στοιχεία, αλλά η τιμή περιέχει ${error.reason.actual}.`;
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Hole":
      return `Λείπει ένα στοιχείο Tuple στη θέση ${issue.index}.`;
    case "Accessor":
      return `Το στοιχείο Tuple στη θέση ${issue.index} πρέπει να είναι ιδιότητα δεδομένων.`;
    case "ExcessProperty":
      return "Δεν επιτρέπεται επιπλέον ιδιότητα Tuple. Αφαιρέστε την ή χρησιμοποιήστε διαφορετικό Type.";
    case "Element":
      return `Το στοιχείο Tuple στη θέση ${issue.index} δεν είναι έγκυρο.`;
  }
};

/** Formats a RecordError in Greek. */
export const formatRecordError: TypeErrorFormatter<RecordError> = (error) => {
  if (error.reason.kind === "NotRecord") {
    return `Η τιμή ${safelyStringifyUnknownValue(error.reason.value)} δεν είναι Record.`;
  }
  if (error.reason.kind === "NotPlainRecord") {
    return "Η τιμή είναι αντικείμενο, αλλά ένα Record Output πρέπει να είναι απλό αντικείμενο ή να έχει πρωτότυπο null.";
  }

  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "Key":
      return `Το κλειδί ιδιότητας ${safelyStringifyUnknownValue(issue.key)} δεν είναι έγκυρο.`;
    case "Value":
      return `Η τιμή της ιδιότητας ${safelyStringifyUnknownValue(issue.key)} δεν είναι έγκυρη.`;
    case "Accessor":
      return `Η ιδιότητα Record ${safelyStringifyUnknownValue(issue.key)} πρέπει να είναι ιδιότητα δεδομένων.`;
    case "NonEnumerable":
      return `Η ιδιότητα Record ${safelyStringifyUnknownValue(issue.key)} πρέπει να είναι απαριθμήσιμη.`;
    case "Collision":
      return `Τα κλειδιά Record ${safelyStringifyUnknownValue(issue.previousKey)} και ${safelyStringifyUnknownValue(issue.key)} αποκωδικοποιούνται στο ίδιο κλειδί ${safelyStringifyUnknownValue(issue.outputKey)}.`;
  }
};

/** Formats an ObjectError in Greek. */
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
        return "Μια ιδιότητα Object πρέπει να είναι ιδιότητα δεδομένων. Υλοποιήστε τις τιμές accessor ως απλά δεδομένα πριν χρησιμοποιήσετε αυτό το Type ή χρησιμοποιήστε διαφορετικό Type.";
      case "NonEnumerable":
        return "Μια ιδιότητα Object πρέπει να είναι απαριθμήσιμη. Κάντε την απαριθμήσιμη ή χρησιμοποιήστε διαφορετικό Type.";
    }
  }
  if (propertyError.type === "ObjectMissingProperty") {
    return `Λείπει η απαιτούμενη ιδιότητα ${safelyStringifyUnknownValue(key)}.`;
  }
  if (typeof key === "symbol") {
    return "Ένα κλειδί ιδιότητας Object πρέπει να είναι συμβολοσειρά. Αφαιρέστε την ιδιότητα συμβόλου ή χρησιμοποιήστε διαφορετικό Type.";
  }
  if (propertyError.type === "ObjectExcessProperty") {
    return `Η ιδιότητα ${safelyStringifyUnknownValue(key)} δεν επιτρέπεται. Αφαιρέστε την ή χρησιμοποιήστε διαφορετικό Type.`;
  }
  return `Η ιδιότητα ${safelyStringifyUnknownValue(key)} δεν είναι έγκυρη.`;
};

/** Formats a DiscriminatedUnionError in Greek. */
export const formatDiscriminatedUnionError: TypeErrorFormatter<
  DiscriminatedUnionError
> = (error) => {
  switch (error.reason.kind) {
    case "Object":
      return formatPlainObjectRootError(error.reason.error.reason);
    case "PropertyAccess": {
      const property = `Η διακριτική ιδιότητα ${safelyStringifyUnknownValue(error.reason.key)}`;
      if (error.reason.reason === "Accessor") {
        return `${property} πρέπει να είναι ιδιότητα δεδομένων.`;
      }
      if (error.reason.reason === "Inherited") {
        return `${property} πρέπει να είναι ιδιόκτητη ιδιότητα.`;
      }
      return `${property} πρέπει να είναι απαριθμήσιμη.`;
    }
    case "Discriminator":
      return `Η διακριτική ιδιότητα ${safelyStringifyUnknownValue(error.reason.key)} έχει μη αναμενόμενη τιμή ${safelyStringifyUnknownValue(error.reason.value)}.`;
    case "Member":
      return `Η επιλεγμένη παραλλαγή ${safelyStringifyUnknownValue(error.reason.discriminator)} δεν είναι έγκυρη.`;
  }
};

/** Formats a JsonValueError in Greek. */
export const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (
  error,
) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `Η τιμή ${safelyStringifyUnknownValue(issue.value)} δεν είναι τιμή JSON.`;
    case "NonFiniteNumber":
      return "Ένας αριθμός JSON πρέπει να είναι πεπερασμένος.";
    case "UnexpectedPrototype":
      return "Η τιμή είναι αντικείμενο, αλλά ένα αντικείμενο JsonValue πρέπει να είναι απλό αντικείμενο ή να έχει πρωτότυπο null.";
    case "Accessor":
      return "Μια ιδιότητα JSON πρέπει να είναι ιδιότητα δεδομένων. Υλοποιήστε τις τιμές accessor ως απλά δεδομένα πριν χρησιμοποιήσετε αυτό το Type ή χρησιμοποιήστε διαφορετικό Type.";
    case "NonEnumerable":
      return "Μια ιδιότητα αντικειμένου JSON πρέπει να είναι απαριθμήσιμη. Αφαιρέστε την ή χρησιμοποιήστε διαφορετικό Type.";
    case "SymbolProperty":
      return "Ένα κλειδί ιδιότητας αντικειμένου JSON πρέπει να είναι συμβολοσειρά. Αφαιρέστε την ιδιότητα συμβόλου ή χρησιμοποιήστε διαφορετικό Type.";
    case "Hole":
      return "Λείπει ένα στοιχείο πίνακα JSON.";
    case "ExcessProperty":
      return "Δεν επιτρέπεται επιπλέον ιδιότητα πίνακα JSON. Αφαιρέστε την ή χρησιμοποιήστε διαφορετικό Type.";
    case "CircularReference":
      return "Ένα JsonValue δεν πρέπει να περιέχει κυκλικές αναφορές.";
  }
};

/** Formats a JsonError in Greek. */
export const formatJsonError: TypeErrorFormatter<JsonError> = (error) =>
  `Η τιμή ${safelyStringifyUnknownValue(error.value)} δεν μπορεί να αναλυθεί ως JsonValue.`;
