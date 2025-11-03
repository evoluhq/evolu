---
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/relay": patch
---

Add relay authentication support with `authenticateOwner` callback

- Add `createWebSocketTransportConfig` helper to create WebSocket transports with OwnerId for relay authentication
- Add `parseOwnerIdFromUrl` to extract OwnerId from URL query strings on relay side
- Add `authenticateOwner` callback to `RelayConfig` for controlling relay access by OwnerId
- Add comprehensive relay logging with `createRelayLogger`
- Refactor `createNodeJsRelay` to return `Result<Relay, SqliteError>` for proper error handling
- Add HTTP upgrade authentication flow with appropriate status codes (400, 401, 500)
- Rename `createRelayStorage` to `createRelaySqliteStorage` for clarity
- Add `ProtocolQuotaExceededError` for storage/billing quota management (placeholder for future implementation)
- Improve transport configuration documentation with redundancy best practices
