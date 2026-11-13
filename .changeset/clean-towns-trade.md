---
"@evolu/web": minor
---

Added createPasskeyAuth, which unlocks createEvoluApp's device database with a passkey

The web has no secure storage that needs no prompt, so `createEvoluApp`'s `DeviceSecret` auth needs a key only the user can unlock. `createPasskeyAuth` unlocks the DeviceSecret with a key derived from a passkey's WebAuthn PRF output, which the user confirms on every start, and on the first use creates the passkey. Its `state` tells the app what to show: whether a secret is stored, a failure with whether the app can offer to start over, or the unlocked secret, and where the browser keeps nothing, that the app should start without a passkey. Call `unlock` in a user gesture, and `startOver` with the app's own confirmation, which it asks only when a stored secret would be lost.

```ts
import { AppName, assertEqual } from "@evolu/common";
import { createEvoluDeps, createPasskeyAuth, createRun } from "@evolu/web";

await using run = createRun(createEvoluDeps());
await using auth = await run.orThrow(
  createPasskeyAuth({
    appName: AppName.orThrow("your-app-name"),
    rpName: "Your App",
    userName: "Device",
  }),
);

// Nothing is stored yet, so the first unlock creates the passkey.
assertEqual(auth.state.get(), { type: "Locked", hasDeviceSecret: false });
```

PRF support varies with the browser and the passkey provider, so an unlock can fail with `DeviceSecretKeyUnavailableError` for a provider without PRF, or with `DeviceSecretKeyRefusedError` for a dismissed prompt, a deleted passkey, or a provider that refuses PRF. `createPasskeyKeyProvider` is the key provider it uses with `unlockWrappedDeviceSecret`, for an app that builds its own flow.
