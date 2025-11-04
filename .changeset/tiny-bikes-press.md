---
"@evolu/common": patch
---

Add Standard Schema V1 support

[Evolu Type](http://localhost:3000/docs/api-reference/common/Type) now supports [Standard Schema](https://standardschema.dev/) V1, enabling interoperability with 40+ validation-compatible tools and frameworks.

```ts
const User = object({
  name: NonEmptyTrimmedString100,
  age: Number,
});

const result = User["~standard"].validate({
  name: "Alice",
  age: "not a number",
});
// {
//   issues: [
//     {
//       message: 'A value "not a number" is not a number.',
//       path: ["age"],
//     },
//   ],
// }
```

All error messages have been standardized for consistency.
