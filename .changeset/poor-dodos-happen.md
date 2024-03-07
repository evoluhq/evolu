---
"@evolu/common-web": patch
---

Improve reset/restore privacy

Using location.replace() will not save the current page in session History,
meaning the user will not be able to use the back button to navigate to
it.

It also fixes a bug in Safari, probably related to leaking SQLite WASM.
