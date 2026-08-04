---
"@evolu/common": minor
---

Added runtime identity for interfaces.

`Instance`, `instance`, and `isInstance` provide a realm-neutral alternative to
`instanceof` for trusted objects defined by interfaces. `EvoluType` uses the
same identity to validate Evolu Types.

```ts
interface Foo extends Instance<"Foo"> {
  readonly value: string;
}

const foo: Foo = { ...instance("Foo"), value: "value" };
const isFoo = isInstance<Foo>("Foo");

expect(isFoo(foo)).toBe(true);
```
