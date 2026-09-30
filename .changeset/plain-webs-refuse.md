---
"@evolu/react-native": patch
---

Stopped Expo web builds with a clear error

Expo web is not supported, because Metro can't bundle Evolu's web workers. When
Metro bundled `@evolu/react-native/expo-sqlite` for the web, it got a module
that re-exported `@evolu/react` without `createEvoluDeps`, so an app failed
later with a confusing error. Importing it on the web now throws an error that
says Expo web is not supported and points to `@evolu/react-web` with a web
bundler such as Vite or Next.js.
