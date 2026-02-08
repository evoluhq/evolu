---
"@evolu/common": minor
---

Added Test module for deterministic testing with proper isolation.

**New exports:**

- `testCreateDeps()` - Creates fresh test deps per call for test isolation
- `testCreateRun()` - Test Run with deterministic deps for reproducible fiber IDs, timestamps, and other generated values
- `TestDeps` type extending `RunDeps` with `TestConsoleDep` (for test assertions) and `RandomLibDep` (for seeded randomness)Ø

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
