---
"@evolu/common": patch
---

Fixed Type error messages

- The Tuple length message said "A Tuple must contain exactly 1 elements" for a
  one-element Tuple, and many translations broke the same way for other counts.
  English now says "A Tuple must have length 1, but the value has length 2.",
  and every locale of `@evolu/common/intl` translates it with wording that
  does not depend on the numbers.
- In every locale, `formatMapError` named the two keys of a key collision,
  while English names the indexes of their entries, because Map keys can be any
  value. It now names the indexes. Its messages for an invalid key and an
  invalid value, which were the same, now say which one is invalid.
- The Danish and Telugu messages for an unexpected discriminator value said
  "has an unexpected value" in English. They now say it in Danish and Telugu.
- The Urdu and Marathi `formatLengthError` messages read as though the required
  length was not the expected one. They now say what length the value must
  have.
- The French, Hungarian, Norwegian, and Slovene messages for `String`,
  `Number`, `BigInt`, `Boolean`, `Symbol`, and `Function` used the English
  type name as a native noun, as in "n’est pas un(e) string". French and
  Norwegian now say "of type string", and Hungarian and Slovene translate every
  type name except BigInt.
- A review of every message corrected wording, grammar, and terminology in 37
  locales. For example, German says "keine Map" and uses Eigenschaft and
  Schlüssel instead of Property and Key, Dutch and Swedish use the correct
  terms for signed integers, Korean particles fit the numbers before them,
  Arabic says "null prototype" instead of "empty prototype", Turkish uses
  Turkish word order, and Czech and Slovak keep the remedy sentence for
  non-enumerable properties.
