---
"@evolu/react-native": patch
---

Refused to create the React Native binding on JavaScript engines other than Hermes

The release notes of 16.2.0 require Hermes, and the binding relies on it: Hermes's JSI creates rows and typed arrays and reads a key's or a blob's bytes natively, running no JavaScript. Another engine, such as JavaScriptCore through `@react-native-community/javascriptcore`, inherits JSI's defaults, which call globals such as `Uint8Array` and `Object.create`, so a global the app replaced could make the binding read or write past a buffer, or use a statement a close finalized. The binding now throws `Evolu's SQLite needs the Hermes engine.` when it's created on another engine, so the app fails at startup, in `installPolyfills` when the runtime lacks `crypto.getRandomValues`, or in `createEvoluDeps`.
