---
"@evolu/react-native": major
---

Updated Expo dependencies and removed the OP-SQLite driver

Expo dependencies have been updated to the latest Expo 57 compatible versions.

The `/expo-op-sqlite` and `/bare-op-sqlite` entry points have been removed because OP-SQLite does not natively support the database export required by Evolu's SQLite API. Use `/expo-sqlite` instead; it works in Expo projects and existing React Native projects configured with Expo modules.

OP-SQLite exposes the database file path but does not expose the database bytes required by Evolu's synchronous database export. Completing the driver therefore requires an additional native filesystem implementation that can synchronously read the database file. Evolu does not choose and require such a dependency by default. Applications that need OP-SQLite can use the previous driver as a starting point and add the required export implementation.

Unused `expo-secure-store` and `react-native-sensitive-info` peer dependencies have been removed. React Native local authentication will be redesigned separately.
