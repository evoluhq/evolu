---
"@evolu/react-native": patch
---

Required SQLCipher for the Expo database

When `expo-sqlite` was built without SQLCipher, plain SQLite ignored Evolu's
encryption key, so the database was stored unencrypted without any warning.
Evolu now fails to open a database stored on the device, before keying or
writing it, with an error that says how to enable SQLCipher. `memoryOnly`
databases are not affected.

Enable it with `["expo-sqlite", { "useSQLCipher": true }]` in your app config's
plugins and run `npx expo prebuild --clean`, or, in an app that doesn't run
Expo's prebuild, set the build properties
[Privacy](https://www.evolu.dev/docs/privacy#encryption-on-the-device) lists and
run `pod install` in the `ios` directory, then rebuild the native app. Don't
deliver this version as an over-the-air update to a native build compiled
without SQLCipher, because Evolu would not open its database there. An app
released without SQLCipher has an unencrypted database, which can't be opened
once SQLCipher is on, so it has to convert its database first.
