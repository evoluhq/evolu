---
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/react-native": patch
"@evolu/react-web": patch
---

Add owner usage tracking and storage improvements

### Breaking Changes

- Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
- Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
- Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
- Removed `assertNoErrorInCatch` - it was unnecessary

### Features

- **Identicon generation**: Added `createIdenticon` function that generates deterministic SVG identicons from any `Id`. Supports four styles: `"github"` (5x5 mirrored grid), `"quadrant"` (2x2 color blocks), `"gradient"` (diagonal stripes), and `"sutnar"` (compositional variants)
- **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
- **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
- **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

### Performance

- **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.
