---
"@evolu/react-native": patch
---

Checked at startup that React Native runs Hermes

Evolu's React Native SQLite has required Hermes, React Native's default engine, since 16.2.0, but nothing checked it. An app on another engine, such as JavaScriptCore, now fails at startup with `Evolu's SQLite needs the Hermes engine.`, because Evolu's native code is memory-safe only on Hermes.
