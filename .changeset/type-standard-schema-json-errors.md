---
"@evolu/common": major
---

**Breaking:** Standard Schema validation now returns JSON-serialized errors instead of formatted messages

Users who need human-readable messages should deserialize the error and format it using appropriate `TypeErrorFormatter`s:

```ts
const result = MyType["~standard"].validate(input);
if (!result.ok) {
  for (const issue of result.issues) {
    const error = JSON.parse(issue.message);
    const message = formatTypeError(error);
    // use message...
  }
}
```

This gives consumers full control over error formatting while keeping the Standard Schema integration simple.
