---
"@evolu/common": patch
---

Replaced the mutation ownerId option with owner

Mutations took the owner of a row as `ownerId`, which any owner had, so an app
could write rows for a `SharedReadonlyOwner`. Those changes stayed on the
device: uploading requires the write key, which a read-only owner lacks. The
`owner` option takes an `Owner` with its write key instead, so writing for a
read-only owner no longer compiles. An owner can still be written before
`evolu.useOwner` registers it, and its changes upload once it does.

To migrate, pass the owner instead of its id. To update a row read from a
query, use the owner whose id matches the row's `ownerId`. TypeScript catches a
leftover `ownerId` written at the call, but not in an options object built
elsewhere that also sets `onComplete`, nor in JavaScript. Such a mutation now
writes the row for the AppOwner, so search mutation calls for `ownerId`.

```ts
import {
  assertEqual,
  createOwnerSecret,
  createRandomBytes,
  createSharedOwner,
  createSharedReadonlyOwner,
  id,
  NonEmptyTrimmedString100,
  type Evolu,
} from "@evolu/common";

const Schema = {
  comment: { id: id("Comment"), text: NonEmptyTrimmedString100 },
};
const sharedOwner = createSharedOwner(
  createOwnerSecret({ randomBytes: createRandomBytes() }),
);
const readonlyOwner = createSharedReadonlyOwner(sharedOwner);
const text = NonEmptyTrimmedString100.orThrow("Hello");

const _insertComments = (evolu: Evolu<typeof Schema>): void => {
  // @ts-expect-error MutationOptions has no ownerId option.
  evolu.insert("comment", { text }, { ownerId: sharedOwner.id });

  evolu.insert("comment", { text }, { owner: sharedOwner });

  // @ts-expect-error A SharedReadonlyOwner has no write key, so it cannot own a mutation.
  evolu.insert("comment", { text }, { owner: readonlyOwner });
};

assertEqual(readonlyOwner.id, sharedOwner.id);
```
