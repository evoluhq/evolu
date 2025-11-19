---
"@evolu/react-native": major
---

Refactor React Native package structure and remove react-native-quick-base64 dependency

**Breaking Changes:**

- Package exports reorganized: use `/expo-sqlite`, `/expo-op-sqlite`, or `/bare-op-sqlite` instead of `/expo-sqlite` and `/op-sqlite`
- Updated quickstart documentation to reflect new import paths

**@evolu/react-native:**

- Reorganized package structure with exports in dedicated `/exports` directory
- Move SQLite driver implementations into `/sqlite-drivers` directory
- Created shared dependency initialization in `shared.ts`
- Removed `react-native-quick-base64` dependency (no longer needed)
- Added `createExpoDeps.ts` for Expo-specific configuration including SecureStore integration
- Updated `package.json` exports to include three entry points:
  - `/expo-sqlite` - for Expo projects using expo-sqlite
  - `/expo-op-sqlite` - for Expo projects using @op-engineering/op-sqlite
  - `/bare-op-sqlite` - for bare React Native projects using @op-engineering/op-sqlite
- Reorganized imports following project guidelines (named imports, top-down organization)

**@evolu/common:**

- Added `Platform.ts` module with platform detection utilities
- Refactored `LocalAuth.ts` constants to follow naming conventions:
  - `AUTH_NAMESPACE` → `localAuth_Namespace`
  - `AUTH_DEFAULT_OPTIONS` → `localAuthDefaultOptions`
  - `AUTH_METAKEY_LAST_OWNER` → `localAuthMetakeyLastOwner` (private)
  - `AUTH_METAKEY_OWNER_NAMES` → `localAuthMetakeyOwnerNames` (private)

**Documentation:**

- Updated quickstart guide to remove `react-native-quick-base64` from installation instructions
- Simplified Expo setup warnings and instructions
- Updated React Native import example to use `/bare-op-sqlite` path
