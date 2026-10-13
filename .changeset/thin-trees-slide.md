---
"@evolu/nodejs": patch
---

Updated better-sqlite3 to 13

better-sqlite3 13 runs on Node-API and ships prebuilt binaries for macOS, Linux (glibc and musl), and Windows on x64 and arm64 inside the package, so installing `@evolu/nodejs` or `@evolu/relay` no longer downloads a binary from GitHub. Node.js 24 remains supported. It also brings SQLite 3.53.4.
