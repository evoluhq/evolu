---
"@evolu/react-native": major
---

Bump to version 14.0.0 to resolve version ordering

Version 13.0.0 was released on June 8, 2025, but then preview versions (12.0.1-preview.x) were released afterwards, creating a broken version ordering. This caused `@latest` dist-tag to incorrectly point to 11.1.2 instead of the newer releases. Bumping to 14.0.0 ensures clean, linear version progression.

Note: Version 13.0.0 existed but had incorrect npm dist-tags and was superseded by preview versions. The changes from that release are now consolidated in 14.0.0.

### Major Changes

- Refactored React Native package structure and removed react-native-quick-base64 dependency
  - Package exports reorganized: use `/expo-sqlite`, `/expo-op-sqlite`, or `/bare-op-sqlite`
  - Reorganized package structure with exports in dedicated `/exports` directory
  - Moved SQLite driver implementations into `/sqlite-drivers` directory
  - Added `createExpoDeps.ts` for Expo-specific configuration including SecureStore integration
  - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
