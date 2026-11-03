---
"@evolu/common": patch
---

Renamed the Offline sync status to Disconnected

`OwnerSyncStatus` reported `Offline` when every relay was disconnected, and `RelaySyncStatus` when its relay was. Evolu can't tell an offline device from a relay it can't reach, so the name, and the message our examples showed ("Changes will sync when you're back online"), could tell users they were offline while their internet worked. The status is now `Disconnected`, like the connection it comes from, and `OfflineSyncStatus` is `DisconnectedSyncStatus`. TypeScript rejects the old name, so rename it where you handle the status, and tell users that the app can't reach its sync server, not that they are offline.

```ts
import { assertEqual } from "@evolu/common";
import type { OwnerSyncStatus } from "@evolu/common/local-first";

const syncStatusToMessage = (status: OwnerSyncStatus): string | null => {
  switch (status.type) {
    case "NoRelays":
    case "Syncing":
    case "Synced":
      return null;
    // @ts-expect-error OwnerSyncStatus has no "Offline" type.
    case "Offline":
      return "Offline.";
    case "Disconnected":
      return "Can't reach the sync server.";
    case "Error":
      return `Sync error: ${status.error.type}.`;
  }
};

assertEqual(
  syncStatusToMessage({ type: "Disconnected" }),
  "Can't reach the sync server.",
);
```
