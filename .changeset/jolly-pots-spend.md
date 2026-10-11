---
"@evolu/react-native": patch
---

Listed the SQLCipher build properties in the startup error

When `expo-sqlite` was built without SQLCipher, the startup error sent an app
that doesn't run Expo's prebuild to the docs for the build properties to set. It
now lists them itself: `expo.sqlite.useSQLCipher=true` in
`android/gradle.properties` and `"expo.sqlite.useSQLCipher": "true"` in
`ios/Podfile.properties.json`.
