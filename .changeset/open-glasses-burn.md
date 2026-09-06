---
"@evolu/common": minor
---

Added validation issues with paths

Use `typeErrorToIssues(type, error)` to convert a Type validation error into a
non-empty array of `TypeIssue` values. Each issue contains a `path` from the
root value and a formatted `message`. Nested and localized formatters are
preserved; root errors have an empty path.

Pass the Type that produced the error. The helper does not validate again, so
decode with `{ errors: "all" }` to collect every issue.

```ts
import {
  assertEqual,
  assertErr,
  assertType,
  BooleanFromString,
  object,
  PortFromString,
  typeErrorToIssues,
  type NonEmptyReadonlyArray,
  type TypeIssue,
} from "@evolu/common";

const Settings = object({
  server: object({ port: PortFromString }),
  enabled: BooleanFromString,
});
const result = Settings.fromUnknown(
  { server: { port: "65536" }, enabled: "maybe" },
  { errors: "all" },
);
assertErr(result);

const issues = typeErrorToIssues(Settings, result.error);
assertType<typeof issues, NonEmptyReadonlyArray<TypeIssue>>();
assertEqual(issues, [
  {
    path: ["server", "port"],
    message: "The value 65536 must be less than or equal to 65535.",
  },
  {
    path: ["enabled"],
    message: 'The value "maybe" is not a boolean. Use true or false.',
  },
]);
```
