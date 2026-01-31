---
"@evolu/common": minor
---

Added Test module for deterministic testing with proper isolation.

**New exports:**

- `testCreateDeps()` - Creates fresh test deps per call for test isolation
- `testCreateRunner()` - Test runner with deterministic deps for reproducible fiber IDs, timestamps, and other generated values
- `TestDeps` type combining `RandomDep`, `RandomLibDep`, `RandomBytesDep`, and `TimeDep`

**Pattern:**

```ts
test("my test", () => {
  const deps = testCreateDeps();
  const id = createId(deps);
  // Each test gets fresh, isolated deps
});

test("with custom seed", () => {
  const deps = testCreateDeps({ seed: "my-test" });
  // Reproducible randomness
});
```
