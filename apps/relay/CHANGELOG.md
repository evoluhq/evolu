# @evolu/relay

## 1.1.2-preview.16

### Patch Changes

- Updated dependencies [8f0c0d3]
  - @evolu/common@6.0.1-preview.34
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.15

### Patch Changes

- Updated dependencies [2f87ac8]
  - @evolu/common@6.0.1-preview.33
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.14

### Patch Changes

- 897bbc8: Reduce Docker image size and improve runtime defaults.
  - Use `pnpm deploy --prod --legacy` to ship a minimal runtime; image ~116 MB (≈59 MB compressed).
  - Set `NODE_ENV=production` and add a robust TCP healthcheck.
  - Persist data under `/app/data` (declare VOLUME, ensure dir) and fix compose volume mapping.
  - Streamline README: concise Docker build/run with logs; remove web‑app testing section; place local steps under Docker.

## 1.1.2-preview.13

### Patch Changes

- e4d1149: Improve Docker docs and remove Docker scripts

## 1.1.2-preview.12

### Patch Changes

- Updated dependencies [a1dfb7a]
  - @evolu/common@6.0.1-preview.32
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.11

### Patch Changes

- Updated dependencies [202eaa3]
- Updated dependencies [eed43d5]
  - @evolu/common@6.0.1-preview.31
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.10

### Patch Changes

- e2547d2: isOwnerWithinQuota is required, improve docs
- Updated dependencies [e2547d2]
- Updated dependencies [05fe5d5]
  - @evolu/common@6.0.1-preview.30
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.9

### Patch Changes

- 6195115: Relay access control and quota management

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

- Updated dependencies [36af10c]
- Updated dependencies [91c132c]
- Updated dependencies [6195115]
- Updated dependencies [13b688f]
  - @evolu/common@6.0.1-preview.29
  - @evolu/nodejs@1.0.1-preview.11

## 1.1.2-preview.8

### Patch Changes

- Updated dependencies [7216d47]
  - @evolu/common@6.0.1-preview.28
  - @evolu/nodejs@1.0.1-preview.10

## 1.1.2-preview.7

### Patch Changes

- Updated dependencies [a957aa0]
  - @evolu/common@6.0.1-preview.27
  - @evolu/nodejs@1.0.1-preview.10

## 1.1.2-preview.6

### Patch Changes

- Updated dependencies [f4a8866]
- Updated dependencies [02e8aa0]
- Updated dependencies [31d0d21]
  - @evolu/common@6.0.1-preview.26
  - @evolu/nodejs@1.0.1-preview.10

## 1.1.2-preview.5

### Patch Changes

- Updated dependencies [29886ff]
  - @evolu/common@6.0.1-preview.25
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.4

### Patch Changes

- Updated dependencies [1d8c439]
  - @evolu/common@6.0.1-preview.24
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.3

### Patch Changes

- Updated dependencies [dd3c865]
  - @evolu/common@6.0.1-preview.23
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.2

### Patch Changes

- Updated dependencies [446eac5]
  - @evolu/common@6.0.1-preview.22
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.1

### Patch Changes

- d913cf9: Add relay authentication support with `authenticateOwner` callback
  - Add `createWebSocketTransportConfig` helper to create WebSocket transports with OwnerId for relay authentication
  - Add `parseOwnerIdFromUrl` to extract OwnerId from URL query strings on relay side
  - Add `authenticateOwner` callback to `RelayConfig` for controlling relay access by OwnerId
  - Add comprehensive relay logging with `createRelayLogger`
  - Refactor `createNodeJsRelay` to return `Result<Relay, SqliteError>` for proper error handling
  - Add HTTP upgrade authentication flow with appropriate status codes (400, 401, 500)
  - Rename `createRelayStorage` to `createRelaySqliteStorage` for clarity
  - Add `ProtocolQuotaExceededError` for storage/billing quota management (placeholder for future implementation)
  - Improve transport configuration documentation with redundancy best practices

- Updated dependencies [d913cf9]
  - @evolu/common@6.0.1-preview.21
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.0

### Patch Changes

- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [5c05d2e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20
  - @evolu/nodejs@1.0.1-preview.8
