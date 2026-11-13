---
"@evolu/react-native": minor
---

Added loadDeviceSecret, which keeps createEvoluApp's DeviceSecret in secure storage

`createEvoluApp`'s `DeviceSecret` auth needs a secret only the platform can unlock. `loadDeviceSecret` creates one on the first use, keeps it in the iOS Keychain or, on Android, encrypted with an Android Keystore key, and loads it at later starts without a prompt. It fails with a `LoadDeviceSecretError`: when Android can't read a stored one, `DeviceSecretUnreadableError`, and it keeps the secret. Let the user try again, and once they confirm, `forgetDeviceSecret` starts over; the AppOwners that device database kept then come back only from their backups.

```ts
import {
  assertType,
  type DeviceSecret,
  type Task,
  type UnknownError,
} from "@evolu/common";
import type {
  DeviceSecretStorageUnavailableError,
  DeviceSecretUnreadableError,
  LoadDeviceSecretError,
  loadDeviceSecret,
} from "@evolu/react-native";

// Pass the secret to createEvoluApp as { type: "DeviceSecret", secret }.
assertType<
  ReturnType<typeof loadDeviceSecret>,
  Task<DeviceSecret, LoadDeviceSecretError>
>();
assertType<
  LoadDeviceSecretError,
  | DeviceSecretStorageUnavailableError
  | DeviceSecretUnreadableError
  | UnknownError
>();
```

It adds native code, so rebuild the app's native project.
