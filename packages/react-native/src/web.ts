/**
 * Expo web is not supported, because Metro can't bundle Evolu's web workers.
 * Importing `@evolu/react-native/expo-sqlite` in a web build throws. For the
 * web, use `@evolu/react-web` with a web bundler such as Vite or Next.js.
 *
 * @module
 */

// Expo's Metro resolves the `browser` condition of this package's exports here
// when it bundles for the web, so an import fails right away instead of later
// with a missing export.
throw new Error(
  "Evolu does not support Expo web. For the web, use @evolu/react-web with a web bundler such as Vite or Next.js.",
);

// oxlint-disable-next-line unicorn/require-module-specifiers -- Marks this file as a module so it can be imported.
export {};
