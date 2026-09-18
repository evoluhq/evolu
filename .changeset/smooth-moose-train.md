---
"@evolu/common": minor
---

Added explicit synchronization requests for active owners

Call `evolu.requestSync(ownerId)` after resolving a relay quota error to retry locally
stored changes. It requests a fresh reconciliation through the owner's active
transports while preserving connections and subscriptions, including those shared
by multiple instances or tabs. The call returns immediately; errors continue
through the existing Evolu error store.

Requests skip sync-message creation while all of the owner's transports are
closed. Synchronization starts automatically when a transport opens.

```ts
import { assertType, type Evolu, type OwnerId } from "@evolu/common";

// Call after successfully increasing the affected owner's relay quota.
const onQuotaIncreased = (evolu: Evolu, ownerId: OwnerId) => {
  evolu.requestSync(ownerId);
};

assertType<typeof onQuotaIncreased, (evolu: Evolu, ownerId: OwnerId) => void>();
```
