---
"@evolu/common": minor
"@evolu/react-native": minor
"@evolu/react-web": minor
"@evolu/web": minor
---

Added `evolu.devicePersistence`, which replaced `onStorageUnavailable`

`evolu.devicePersistence` resolves once the database starts to what Evolu knows
for sure about keeping it on the device:

- `Persisted`: the database is the app's own file, as in React Native.
- `NotPersisted`: it is kept in memory, because the `memoryOnly` option asks for
  it or the browser offers no persistent storage, as in Safari's Private
  Browsing and Firefox's private windows. Changes that have not synced are lost
  when the tab hosting the database closes.
- `Unknown`: a browser stores it but may delete it, as Chrome's incognito does
  when the session ends, without telling the app.

Show users a notice for `NotPersisted`, and do not tell them their data is saved
on the device unless it is `Persisted`. The examples no longer say so.

Browsers may also delete a site's stored data when disk space runs low,
including changes that have not synced yet. After the first local change of a
database whose `devicePersistence` is `Unknown`, the web `createEvoluDeps` now
asks the browser once per tab with `navigator.storage.persist()` to keep the
site's data until the user deletes it. Chrome and Safari decide silently.
Firefox shows a permission prompt, and each tab asks until the user allows it.
To ask at another moment, or never, pass your own `requestPersistentStorage` to
the web or React web `createEvoluDeps`.

The `onStorageUnavailable` option of the web and React web `createEvoluDeps` was
removed; use `evolu.devicePersistence` instead. A custom platform adapter no
longer receives the `StorageUnavailable` shared worker message, and its shared
worker must provide `getDevicePersistence` instead of the optional
`isPersistentStorageAvailable`.

The minimal React playground renders this inside a `Suspense` boundary:

```tsx
/**
 * Tells the user when this device doesn't keep their data, and shows nothing
 * otherwise. That happens with the `memoryOnly` option, or where the browser
 * offers no persistent storage, as in Safari's Private Browsing or a Firefox
 * private window. See `DevicePersistence` in `@evolu/common/local-first`.
 */
const DevicePersistenceNotice: FC = () => {
  // Resolves once the database starts.
  const devicePersistence = use(useEvolu().devicePersistence);
  if (devicePersistence !== "NotPersisted") return null;
  return (
    <p className="mb-4 text-sm text-gray-600">
      Your data isn&apos;t kept on this device. Changes that haven&apos;t synced
      are lost when you close this tab.
    </p>
  );
};
```

To never ask the browser to keep the site's data:

```ts
import { assertSame, constVoid } from "@evolu/common";
import type { createEvoluDeps } from "@evolu/web";

type WebEvoluDepsOptions = NonNullable<Parameters<typeof createEvoluDeps>[0]>;

const neverAsk: WebEvoluDepsOptions = { requestPersistentStorage: constVoid };

assertSame(neverAsk.requestPersistentStorage, constVoid);
```
