---
"@evolu/common": patch
---

Narrowed sync route types to what the shared worker publishes

The `error` of a `ProtocolInvalidDataError` or a
`DecryptWithXChaCha20Poly1305Error` in a `SyncRouteError` is now typed as
`UnknownError`, which the shared worker always published, so apps no longer
need to check it at runtime. `SettledSyncRoute.lastReceivedAt` is now `Millis`,
because the reply that skipped the change always set it. The unused
`SyncRouteErrorType` alias was removed; use `SyncRouteError["type"]` instead.
Code that builds these values, such as a test fixture, now wraps the caught
value with `createUnknownError` and gives a settled route its received time.

```ts
import {
  assertEqual,
  assertType,
  createUnknownError,
  Millis,
  type UnknownError,
} from "@evolu/common";
import type {
  SettledSyncRoute,
  SyncRouteError,
} from "@evolu/common/local-first";
// @ts-expect-error SyncRouteErrorType is no longer exported.
import type { SyncRouteErrorType as _SyncRouteErrorType } from "@evolu/common/local-first";

const skipped: SyncRouteError = {
  type: "DecryptWithXChaCha20Poly1305Error",
  error: createUnknownError(new Error("wrong encryption key")),
  at: Millis.orThrow(1000),
};
if (skipped.type === "DecryptWithXChaCha20Poly1305Error")
  assertType<typeof skipped.error, UnknownError>();

const _rawError: SyncRouteError = {
  type: "DecryptWithXChaCha20Poly1305Error",
  // @ts-expect-error A caught value in a route error is an UnknownError.
  error: "wrong encryption key",
  at: Millis.orThrow(1000),
};

// @ts-expect-error A settled route has received the reply that skipped its change.
const _unreceived: SettledSyncRoute["lastReceivedAt"] = null;
const lastReceivedAt: SettledSyncRoute["lastReceivedAt"] = Millis.orThrow(1000);
assertEqual(lastReceivedAt, 1000);

const errorType: SyncRouteError["type"] = skipped.type;
assertEqual(errorType, "DecryptWithXChaCha20Poly1305Error");
```
