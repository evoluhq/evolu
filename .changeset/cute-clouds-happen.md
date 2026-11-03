---
"@evolu/common": patch
---

Replaced dead relay connections sooner after a system sleep

After a system sleep, a relay connection can die without closing, and `OwnerSyncStatus` reads `Synced` while changes from other devices don't arrive, until the shared worker notices the sleep and replaces the connection. The worker now checks each open connection every five seconds instead of every thirty, so it notices the sleep within about five seconds of waking. This applies wherever `performance.now()` stops during sleep: in WebKit, Chromium and Firefox on Apple platforms, including WebViews such as Tauri's on macOS, in Chromium and Firefox on Linux and Android, and in React Native. The check compares two local clocks and sends nothing, so relays see no difference.
