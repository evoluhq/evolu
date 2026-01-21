---
"@evolu/common": minor
---

Added Test module for deterministic testing with proper isolation.

**New exports:**

- `createTestDeps()` - Creates fresh test deps per call for test isolation
- `createTestRunner()` - Test runner with deterministic deps for reproducible fiber IDs, timestamps, and other generated values
- `TestDeps` type combining `RandomDep`, `RandomLibDep`, `RandomBytesDep`, and `TimeDep`

**Pattern:**

```ts
test("my test", () => {
  const deps = createTestDeps();
  const id = createId(deps);
  // Each test gets fresh, isolated deps
});

test("with custom seed", () => {
  const deps = createTestDeps({ seed: "my-test" });
  // Reproducible randomness
});
```
