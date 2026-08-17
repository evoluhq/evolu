---
"@evolu/common": minor
---

Added `templateLiteral` and `templateLiteralParser`

`templateLiteral` composes fixed strings and string-encoded Types into a
canonical string Type. Its Output remains a string, so it is suitable for
validation without decoding the individual parts.

```ts
import { templateLiteral, union } from "@evolu/common";

const Language = union("en", "cs");
const Region = union("US", "CZ");
const Locale = templateLiteral(Language, "-", Region);
type Locale = typeof Locale.Output;

const locale: Locale = "cs-CZ";
// @ts-expect-error Locale excludes the unsupported "fr" language.
const invalidLocale: Locale = "fr-CZ";

expectTypeOf<Locale>().toEqualTypeOf<"en-US" | "en-CZ" | "cs-US" | "cs-CZ">();
expect(locale).toBe("cs-CZ");
expectOk(Locale.fromUnknown("cs-CZ"), "cs-CZ");
expect(Locale.is("fr-CZ")).toBe(false);
```

`Digit`, the bounded digit ranges, duration literals, and `PercentageLiteral`
now use runtime Types while remaining usable as TypeScript types.

```ts
import { Digit1To23, DurationLiteral, PercentageLiteral } from "@evolu/common";

const digit: Digit1To23 = "23";
const duration: DurationLiteral = "1.5s";
const percentage: PercentageLiteral = "12.5%";

// @ts-expect-error Digit1To23 excludes "24".
const invalidDigit: Digit1To23 = "24";
// @ts-expect-error DurationLiteral requires the canonical "500ms" instead of "0.5s".
const invalidDuration: DurationLiteral = "0.5s";
// @ts-expect-error PercentageLiteral excludes percentages above 100%.
const invalidPercentage: PercentageLiteral = "100.1%";

expect(Digit1To23.is("23")).toBe(true);
expect(Digit1To23.is("24")).toBe(false);
expect(DurationLiteral.is("1.5s")).toBe(true);
expect(DurationLiteral.is("0.5s")).toBe(false);
expect(PercentageLiteral.is("12.5%")).toBe(true);
expect(PercentageLiteral.is("100.1%")).toBe(false);
```

`templateLiteralParser` accepts the same template parts as `templateLiteral`:
fixed string literals and Types canonically encoded as strings. Instead of
keeping Output as a string, fixed literals define the framing and Output is a
readonly Tuple of the decoded Type parts. `to` encodes that Tuple back into the
canonical string represented by the parent Type.

When every capture uses identity encoding, the parent Output is the exact
TypeScript template literal type. A transforming capture makes it nominal;
create such strings with `to` or validate them with the parent Type.

Deterministic framing is a core correctness guarantee. It preserves
reversibility and keeps capture boundaries unambiguous. Different capture Tuples
must never encode to the same string. The parser provides predictable parsing
without pathological backtracking and decodes each capture once, so adversarial
input cannot trigger exponential parser work.

Fixed-width captures may be adjacent, but only one variable-width capture is
allowed. A delimiter alone is not enough because it can also occur inside a
capture.

### Parse and create structured strings

```ts
import { templateLiteralParser, union } from "@evolu/common";

const Language = union("en", "cs");
const Region = union("US", "CZ");

// Define a Type for "en-US" | "en-CZ" | "cs-US" | "cs-CZ".
const SupportedLocale = templateLiteralParser(Language, "-", Region);

// Output is the decoded language and region.
type SupportedLocale = typeof SupportedLocale.Output;
expectTypeOf<SupportedLocale>().toEqualTypeOf<
  readonly ["en" | "cs", "US" | "CZ"]
>();

// The parent Output is the canonical locale string.
type SupportedLocaleLiteral = typeof SupportedLocale.parent.Output;
expectTypeOf<SupportedLocaleLiteral>().toEqualTypeOf<
  "en-US" | "en-CZ" | "cs-US" | "cs-CZ"
>();

// Parse an unknown string into structured data.
const result = SupportedLocale.fromUnknown("cs-CZ");
assert(result.ok);
const locale = result.value;
expectTypeOf(locale).toEqualTypeOf<SupportedLocale>();
expect(locale).toEqual(["cs", "CZ"]);
expectErr(SupportedLocale.fromUnknown("cs/CZ"), {
  type: "TemplateLiteral",
  value: "cs/CZ",
});

// Encode structured data into its canonical string.
const localeLiteral = SupportedLocale.to(locale);
expectTypeOf(localeLiteral).toEqualTypeOf<SupportedLocaleLiteral>();
expect(localeLiteral).toBe("cs-CZ");

// Validate a string configuration value.
const configValue: unknown = "cs-CZ";
assert(SupportedLocale.parent.is(configValue));
expectTypeOf(configValue).toEqualTypeOf<SupportedLocaleLiteral>();
expect(SupportedLocale.parent.is("fr-CZ")).toBe(false);
```

`SupportedLocale` is structured data for application code.
`SupportedLocaleLiteral` is its canonical representation for configuration and
other APIs that require a string, such as URL parameters, environment variables,
and storage keys.

### Use branded string captures

Branded captures model strings that TypeScript template literal types cannot
express exactly, such as arbitrary-length canonical decimals:

```ts
import { NonNegativeDecimalString, templateLiteralParser } from "@evolu/common";

const DecimalText = templateLiteralParser("decimal:", NonNegativeDecimalString);

// DecimalText.to requires a validated NonNegativeDecimalString.
const zero = NonNegativeDecimalString.orThrow("0");

expectOk(DecimalText.fromUnknown("decimal:0"), [zero]);
expect(DecimalText.to([zero])).toBe("decimal:0");
```

### Decode captures into non-string data

Capture Types can use transformations to decode substrings into non-string data:

```ts
import { Int64FromInt64String, templateLiteralParser } from "@evolu/common";

const ItemId = templateLiteralParser("item-", Int64FromInt64String);
type ItemId = typeof ItemId.Output;
type ItemIdLiteral = typeof ItemId.parent.Output;

// Decode the string into structured data.
const result = ItemId.fromUnknown("item-42");
assert(result.ok);
const itemId = result.value;
expectTypeOf(itemId).toEqualTypeOf<ItemId>();
expect(itemId).toEqual([42n]);

// Encode the structured data into its canonical string.
const itemIdLiteral = ItemId.to(itemId);
expectTypeOf(itemIdLiteral).toEqualTypeOf<ItemIdLiteral>();
expect(itemIdLiteral).toBe("item-42");

// TypeScript cannot prove from the literal alone that "42" is a valid Int64 encoding.
// @ts-expect-error Validate it with ItemId.parent or create it with ItemId.to.
const invalidItemIdLiteral: ItemIdLiteral = "item-42";
```

### Use deterministic framing

Fixed-width captures can be adjacent:

```ts
import { templateLiteralParser, union } from "@evolu/common";

const Digit = union("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");
const TwoDigits = templateLiteralParser(Digit, Digit);
type TwoDigits = typeof TwoDigits.Output;
type TwoDigitsLiteral = typeof TwoDigits.parent.Output;

const twoDigits: TwoDigits = ["4", "2"];
const twoDigitsLiteral: TwoDigitsLiteral = "42";
// @ts-expect-error TwoDigitsLiteral requires exactly two digits.
const threeDigitsLiteral: TwoDigitsLiteral = "123";

expectOk(TwoDigits.from.parent(twoDigitsLiteral), twoDigits);
expect(TwoDigits.to(twoDigits)).toBe(twoDigitsLiteral);
```

TypeScript rejects multiple variable-width captures because their encoded
boundaries would be ambiguous:

```ts
import { String, templateLiteralParser } from "@evolu/common";

// @ts-expect-error At most one Type capture can have a variable-width string representation.
templateLiteralParser(String, ":", String);
```
