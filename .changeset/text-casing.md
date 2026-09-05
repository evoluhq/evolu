---
"@evolu/common": minor
---

Added text casing Types and conversion functions

Check and change text casing with Types that work directly with TypeScript's
built-in string casing types. Use `CapitalizedString`, `UncapitalizedString`,
`UppercasedString`, and `LowercasedString` to validate input without changing it.
Use `capitalize`, `uncapitalize`, `uppercase`, and `lowercase` to create a value
with the desired casing from any string. When the input is a string literal,
TypeScript infers the exact converted value.

Capitalization changes the first Unicode code point and keeps the rest of the
text intact. Uppercasing and lowercasing apply to the whole string. Empty strings
stay empty, and characters without casing, such as digits and emoji, are allowed.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  assertType,
  capitalize,
  CapitalizedString,
  lowercase,
  LowercasedString,
  uncapitalize,
  UncapitalizedString,
  uppercase,
  UppercasedString,
} from "@evolu/common";

const title: CapitalizedString = "Hello world";
assertOk(CapitalizedString.fromUnknown(title), title);
assertErr(CapitalizedString.fromUnknown("hello world"));
const greeting = capitalize("hello world");
assertType<typeof greeting, "Hello world">();
assertEqual(greeting, title);
assertEqual(uncapitalize("Hello WORLD"), "hello WORLD");
assertEqual(uppercase("Hello world"), "HELLO WORLD");
assertEqual(lowercase("Hello WORLD"), "hello world");

assertType<CapitalizedString, Capitalize<string>>();
assertType<UncapitalizedString, Uncapitalize<string>>();
assertType<UppercasedString, Uppercase<string>>();
assertType<LowercasedString, Lowercase<string>>();

assertEqual(capitalize("𐐨x"), "𐐀x");
assertEqual(uppercase("Straße"), "STRASSE");
assertEqual(lowercase(""), "");
```

Apply `capitalized`, `uncapitalized`, `uppercased`, or `lowercased` to an existing
string Type to retain its constraints during validation. The conversion
functions return the corresponding intrinsic type without retaining input
brands: Unicode casing can change the length, as `ß` becomes `SS`.

Error formatters for the new Types are available in every supported locale.
