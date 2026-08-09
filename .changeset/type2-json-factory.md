---
"@evolu/common": minor
---

Added the Type2 `json` factory.

`json(Type, Name)` creates a branded `Json` Type for storing another Type as
JSON text. It statically requires the supplied Type's `CanonicalInput` to be
JSON-compatible and returns total Type-to-Json and Json-to-Type conversions.

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
