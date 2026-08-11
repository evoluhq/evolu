---
"@evolu/common": major
---

Replaced the legacy Evolu Type implementation with a lawful, composable codec
system.

### Added

#### CanonicalInput

Added `CanonicalInput` alongside the existing `Input` and `Output`. Type now
distinguishes its complete decoding boundary from the statically known subtype
returned by complete encoding:

```text
Input           ── partial decode ──▶ Output
CanonicalInput  ◀─── total encode ─── Output

CanonicalInput ⊆ Input
```

`CanonicalInput` is the declared return type of `to`. It contains every encoded
result and is itself contained by `Input`, but can be wider than the values
actually emitted. `Output` describes the semantic value, which can use a
different representation.

For `FiniteNumber`, `Output` also describes the encoded result precisely. Its
`Input` is correctly `number`, allowing decoding to reject `NaN` and
infinities, while its `Output` and `CanonicalInput` are `FiniteNumber`. Encoding
preserves that finite-number guarantee.

For `Int64FromInt64String`, `Output` cannot describe the encoded result. Its
`Input` is `string`, its `Output` is `Int64`, and its `CanonicalInput` is
`Int64String`. Encoding an `Int64` produces the validated string representation,
not an unrefined `string` or another `Int64`.

Structural Type factories derive `CanonicalInput` recursively. When a refinement
follows an arbitrary transformation, it conservatively retains the
transformation's return type because TypeScript cannot determine which values
the encoder returns for the narrowed `Output`.

#### Transformations

Added first-class `transform` Types and total `to` encoding. Transformations can
change runtime representations in both directions while preserving precise
Input, Output, CanonicalInput, validation errors, and composition. This supports
lawful codecs such as `Int64FromInt64String` and `DateIsoFromDate` rather than
limiting Types to validation-only refinements.

#### JSON codecs

Added the `json(Type, Name)` factory for creating a branded `Json` Type that
stores another Type as JSON text. It statically requires the supplied Type's
`CanonicalInput` to be JSON-compatible and returns total Type-to-Json and
Json-to-Type conversions.

```ts
// Age is built in; its definition is shown to make the constraint explicit.
const Age = brand("Age", lessThan(200)(NonNegativeInt));

const Person = object({
  name: String,
  age: Age,
});
type Person = typeof Person.Output;

const [PersonJson, personToPersonJson, personJsonToPerson] = json(
  Person,
  "PersonJson",
);
type PersonJson = typeof PersonJson.Output;

const person = Person.orThrow({ name: "Ada", age: 42 });
const stored = personToPersonJson(person);

expectTypeOf(stored).toEqualTypeOf<PersonJson>();
expect(stored).toBe('{"name":"Ada","age":42}');

const restored = personJsonToPerson(stored);

expectTypeOf(restored).toEqualTypeOf<Person>();
expect(restored).toEqual(person);
```

The branded Type validates both the JSON text and the represented Type before
accepting unknown storage values:

```ts
expectOk(PersonJson.fromUnknown('{"name":"Ada","age":42}'), stored);

const invalid = PersonJson.fromUnknown('{"name":"Ada","age":200}');

assert(!invalid.ok);
expect(PersonJson.formatError(invalid.error)).toBe(
  "The value 200 must be less than 200.",
);
```

The factory encodes through the supplied Type's canonical representation,
rejects Types without a JSON-safe `CanonicalInput`, validates branded JSON
against the represented Type, and parses text only once in the generated Type's
specialized Json-parent operation.

- Added Type-owned `formatError` and the `localizeTypes` derivation API. Every
  Type can format its structured errors directly, while `localizeTypes` creates
  fully typed localized Type collections.
- Added typed `from` and `from.parent` entry points. Callers can begin at the
  most precise Type boundary they already satisfy, and the returned `Result`
  contains only errors introduced after that boundary. `fromUnknown` remains
  the complete validation boundary for genuinely unknown values.
- Added `createType`, `lazy`, `discriminatedUnion`, and `objectTag` for custom
  validation, recursive Types, efficient discriminated routing, and object-tag
  domains.
- Added predefined Types including `Never`, `Object`, `Symbol`, `UInt64`,
  `Age`, `PositiveDecimalString`, `DateIsoFromDate`,
  `Int64FromInt64String`, and `JsonValueFromJson`.
- Added structured issue models for Arrays, Sets, Tuples, Objects, Records,
  Unions, discriminated Unions, transformations, and JSON values. Validation
  can stop at the first error or retain every reachable issue.

### Improved

- Made `is` test exact Output membership. A transformed Type no longer reports
  that an encoded Input belongs to its semantic Output domain merely because it
  can be decoded.
- Improved localization to follow composed error graphs without coupling
  validation logic to messages or bundling unused locales. Localized Types
  preserve their structured errors, recursive composition, and specialized
  public operations.
- Improved `instanceOf` to require one concrete constructor and use intrinsic
  prototype-chain membership, accepting subclasses while ignoring custom
  `Symbol.hasInstance` implementations.
- Kept `InferType` for declaring named Object and Typed Type Outputs as
  interfaces, preserving concise interface names in TypeScript tooltips and
  error messages.
- Kept Standard Schema V1 interoperability and improved it to collect
  structural issues across nested values with exact property paths and the
  selected Type's localized messages. Standard Schema Input and Output
  inference now follows the Type's actual codec contract.
- Made structural Types validate exact JavaScript representations. Arrays and
  Tuples require dense own data elements; Objects and Records require own,
  enumerable data properties; closed Objects reject excess properties; and
  accessors are rejected without being invoked.
- Made structural validation realm-neutral where realm identity is not part of
  the semantic domain. Plain objects, Arrays, Sets, and supported built-ins from
  another realm are accepted when their representations are otherwise valid.
- Made Type construction reject invalid declarations that TypeScript cannot
  express, including refinements that replace values, transformation callbacks
  returning the wrong representation, incompatible error names, and ambiguous
  child Types.
- Made recursive validation and canonical JSON encoding stack-safe, including
  direct and mutually recursive `lazy` Types.

### Fixed

- Fixed typed operations silently accepting structurally assignable values that
  violate runtime invariants. Such violations now throw `Expected <Type name>.`
  errors with the exact structured validation error preserved as `cause`.
- Fixed Object and Record validation accepting inherited, hidden,
  accessor-backed, or unexpected properties and fixed Array, Set, and Tuple
  validation accepting invalid structural representations.
- Fixed composed transformations losing output-side validation errors or using
  the wrong decoding and encoding boundary.
- Fixed Union dispatch, error inference, literal shorthand, and composition
  with transformed and structural member Types.
- Fixed localized Types losing specialized public operations, including the
  generated JSON Type's single-parse `from.parent` operation.

### Changed and removed

- Renamed `ExtractType` to `ExtractTyped` to clarify that it selects a
  discriminated member from a `Typed` Output union rather than extracting the
  Output of an Evolu Type.
- Replaced legacy `base` and `recursive` construction with `createType` and
  `lazy`.
- Replaced the legacy global formatter registry and standalone formatter
  functions with Type-owned `formatError` and tree-shakeable localized Type
  collections.
- Removed `CurrencyCode` because its validation modeled currency identifiers
  incorrectly.
- Removed redundant predefined String Types such as `NonEmptyString`,
  `String100`, and `NonEmptyString100`. Applications can compose the exact
  String constraints their domain requires, while Evolu retains the recommended
  trimmed, non-empty defaults.
