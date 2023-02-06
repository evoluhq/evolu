---
"evolu": minor
---

Switch to the official sqlite3 WASM client with a friendly MIT license

Evolu no longer uses IndexedDB for persisting sqlite3 files. Instead, it uses modern Origin-Private FileSystem (OPFS) in Chrome and good old LocalStorage in other browsers.

The LocalStorage implementation leverages VFS, so it doesn't load and save whole files. In other words, it's fast enough. The only limit is LocalStorage max size (5MB), which is sufficient unless a lot of data are stored.

The Origin-Private FileSystem (OPFS) is currently supported only in Chrome, but both Safari and Firefox are finishing their support. Meanwhile, Evolu is using LocalStorage.

We recommend Chrome OPFS Explorer extension to download the sqlite3 file.
