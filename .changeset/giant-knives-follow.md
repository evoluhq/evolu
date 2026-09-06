---
"@evolu/common": minor
---

Included member failures in union validation messages

Union messages now include the retained member failures below the summary.
This makes errors from Types such as `undefinedOr(PortFromString)` actionable
without inspecting an Error's `cause`. Validation, encoding, and structured
errors are unchanged. A Union still produces one issue at its enclosing path;
member indexes and nested paths appear only in the message.

**Custom `Union` formatters now provide the summary, not the complete message.**
Remove any member-error enumeration from those formatters: Evolu appends the
details using the member formatters in the selected locale. Update exact
message assertions and allow multiline messages wherever validation errors are
displayed. Calling a locale's `formatUnionError` directly still returns only
the summary; use the Type's `formatError` to format the complete failure.

Only failures retained during decoding can be reported. The default keeps the
first member failure; `{ errors: "all" }` retains every failed alternative.
Formatting does not run validation again.

```ts
import {
  assertEqual,
  assertErr,
  PortFromString,
  typeErrorToIssues,
  undefinedOr,
} from "@evolu/common";

const Port = undefinedOr(PortFromString);
const result = Port.fromUnknown("65536");
assertErr(result);

const message = [
  "A value does not match any allowed variant.",
  "- 0: PortFromString: The value 65536 must be less than or equal to 65535.",
].join("\n");

assertEqual(Port.formatError(result.error), message);
assertEqual(typeErrorToIssues(Port, result.error), [{ path: [], message }]);
```
