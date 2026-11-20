# React Expo

Evolu in an Expo app, with `@evolu/react-native`. The device database, which
keeps the accounts, is encrypted with a DeviceSecret that the iOS Keychain or
the Android Keystore keeps, so the app starts without a prompt. The first start
offers to create or restore an account. See the
[examples' checklist](../README.md).

## Quick start

Expo Go can't load Evolu's native code, so the example runs as a
[development build](https://docs.expo.dev/develop/development-builds/introduction/).

```bash
# From the repository root...
pnpm install
pnpm --filter "@example/react-expo^..." build

# Start a local relay on ws://localhost:4000, which the example syncs with in
# development
pnpm relay

# In another terminal, build and run the app
pnpm --filter @example/react-expo ios
# or
pnpm --filter @example/react-expo android
```

A release build syncs with Evolu's free relay, which is for testing.
