# TODO: Stack-based disposal sweep

Continue the cleanup-pattern review for brittle manual disposal in production code.

## Goal

Prefer `DisposableStack` or `AsyncDisposableStack` for cleanup paths that dispose multiple resources, so one thrown dispose does not skip later cleanup.

Do not spend time rewriting single-resource disposals unless they are part of a broader cleanup path.

## Confirmed production candidates

### 1. `packages/common/src/RefCount.ts`

Relevant lines: around `116-120`

Current pattern:

```ts
const refCountByKey = stack.adopt(
  createLookupMap<TKey, RefCount, L>({ lookup }),
  (refCountByKey) => {
    for (const refCount of refCountByKey.values()) refCount[Symbol.dispose]();
    refCountByKey.clear();
  },
);
```

Why it matters:

- This is multi-resource cleanup.
- If one `RefCount` dispose throws, later `RefCount`s are skipped.
- `refCountByKey.clear()` is also skipped.

Likely direction:

- Use a local `DisposableStack` inside the adopt cleanup.
- Register each `RefCount` with `disposeStack.use(refCount)`.
- Clear the map in a way that still happens even if one resource dispose throws.

### 2. `packages/common/src/Resource.ts`

Relevant lines: around `670-676`

Current pattern:

```ts
const pairRefCountsByClaim = stack.adopt(
  createLookupMap<C, RefCountByKey<K>, LC>({ lookup: claimLookup }),
  (pairRefCountsByClaim) => {
    for (const pairRefCountByKey of pairRefCountsByClaim.values()) {
      pairRefCountByKey[Symbol.dispose]();
    }
    pairRefCountsByClaim.clear();
  },
);
```

Why it matters:

- Same failure mode as `RefCount.ts`.
- This is a real multi-resource cleanup callback.

Likely direction:

- Use a local `DisposableStack` in the adopt cleanup.
- Register each `pairRefCountByKey` through the stack.
- Keep the map clear deterministic.

## Lower-priority / probably not this task

### `packages/common/src/RefCount.ts`

Relevant lines: around `145-147`

```ts
if (nextCount === 0) {
  refCount[Symbol.dispose]();
  refCountByKey.delete(key);
}
```

This is a single-resource disposal, so it is not the same class of brittleness. Only revisit if you decide the map deletion must happen even when disposal throws.

### `packages/common/src/Resource.ts`

Relevant lines: around `787-790`

```ts
if (pairRefCountByKey.keys().size === 0) {
  pairRefCountsByClaim.delete(claim);
  pairRefCountByKey[Symbol.dispose]();
}
```

Also single-resource disposal. Same note as above.

### `packages/common/src/Task.ts`

The remaining production dispose calls I found there were single-resource disposals, not multi-resource cleanup chains.

## Suggested next-session workflow

1. Update only the confirmed multi-resource cleanup sites first.
2. Add focused tests that prove later resources are still disposed when an earlier dispose throws.
3. Keep tests narrow. `RefCount.test.ts` and `Resource.test.ts` should be enough.
4. Run coverage for the touched source files and keep them at `100%`.

## Testing note

Do not rely on monkey-patching `[Symbol.dispose]` after a resource has already been registered with `stack.use(...)`.

`DisposableStack` captures the disposer when the resource is registered, so post-registration overrides do not test the real stack behavior. Use purpose-built disposable test doubles instead.
