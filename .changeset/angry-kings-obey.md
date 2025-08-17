---
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/web": patch
"@evolu/nodejs": patch
"@evolu/react": patch
"@evolu/react-web": patch
---

Native Base64 ID encoding

Breaking change: Id is encoded into BinaryId via new native algorithm (uses platform Base64 with polyfill). Removed custom Base64Url256 micro-optimization; table & column names now plain strings. Simpler, smaller, more standard code.
