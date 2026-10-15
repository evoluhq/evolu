---
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/oxlint-config": patch
"@evolu/react-native": patch
---

Pinned external runtime dependencies to exact versions

A version range let an app that installed or updated Evolu resolve a newer
release of a dependency that Evolu was never tested with, including a
compromised one. These packages now depend on the exact versions they were
tested with. Their own dependencies still resolve within the ranges they
declare, so an app's lockfile is what fixes the whole tree. Peer dependencies
keep their ranges. If an app also depends on one of these dependencies in
another version, its package manager installs both copies.

A newer release of one of them, such as a security fix, reaches an app only
with an Evolu release that updates it, or sooner through its package manager's
overrides.
