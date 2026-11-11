---
"@evolu/common": minor
---

Added ownerSecretToOwnerId

An app that needed only an OwnerSecret's OwnerId, for example to tell whether a backup's AppOwner is already on the device, had to create the whole AppOwner, which also derives its keys and mnemonic. `ownerSecretToOwnerId` returns only the OwnerId, the same one every owner created from the secret has.

```ts
import {
  assertTrue,
  mnemonicToOwnerSecret,
  ownerSecretToOwnerId,
  testAppOwner,
  type OwnerId,
} from "@evolu/common";

// The IDs of the AppOwners on this device.
const appOwnerIds: ReadonlySet<OwnerId> = new Set([testAppOwner.id]);

// A backup's mnemonic, of an AppOwner that's already on this device.
const secret = mnemonicToOwnerSecret(testAppOwner.mnemonic);

assertTrue(appOwnerIds.has(ownerSecretToOwnerId(secret)));
```
