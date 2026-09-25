---
"@evolu/common": patch
---

Made Type validation and construction faster

Types validate with fewer allocations and less reflection while returning the
same results, errors, issues, and messages. On the schemabenchmarks.dev Product
schema, `fromUnknown` of valid data is about 2.8 times faster, and of invalid
data about 5 times with the default first-error mode and 2.5 times with all
errors. `is` is about 2.3 times faster for valid data and 3.3 times for invalid
data, `~standard.validate` about 2.4 to 2.8 times, and creating the schema about
5 times.

Object keys are enumerated with `getOwnPropertyNames` and `getOwnPropertySymbols`
instead of one `Reflect.ownKeys` call, so a Proxy's `ownKeys` trap can run more
than once per validation. Type nodes have more internal symbol-keyed own
properties. Bundles that use Types grow by about 0.1 to 1.6 KB brotli.
