---
"@evolu/common": minor
"@evolu/nodejs": minor
"@evolu/relay": minor
---

Relay access control and quota management

**Access Control**

- Added `isOwnerAllowed` callback to control which owners can connect to the relay
- Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
- Replaces the previous `authenticateOwner` configuration option

**Quota Management**

- Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
- Relays can now enforce per-owner storage quotas
- New `ProtocolQuotaError` for quota violations
- When quota is exceeded, only the affected device stops syncing - other devices continue normally
- Usage is measured per owner as logical data size, excluding storage implementation overhead

Check the Relay example in `/apps/relay`.
