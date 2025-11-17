# @evolu/common

## 6.0.1-preview.33

### Patch Changes

- 2f87ac8: Improve Array module docs and refactor helpers.

  **Improvements:**
  - Reorganize Array module documentation with clearer structure, code examples, and categories (Types, Guards, Operations, Transformations, Accessors, Mutations)
  - Swap parameter order in `appendToArray` and `prependToArray` to follow data-first pattern (array parameter first)
  - Add `@category` JSDoc tags to all exported items for better TypeDoc organization
  - Add `### Example` sections to all functions with practical usage demonstrations
  - Update `dedupeArray` to use function overloads (similar to `mapArray`) for better type preservation with non-empty arrays

## 6.0.1-preview.32

### Patch Changes

- a1dfb7a: Add `dedupeArray` helper for immutable array deduplication. The function removes duplicate items from an array, optionally using a key extractor function. Returns a readonly array and does not mutate the input.

  ```ts
  dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]

  dedupeArray([{ id: 1 }, { id: 2 }, { id: 1 }], (x) => x.id); // [{ id: 1 }, { id: 2 }]
  ```

## 6.0.1-preview.31

### Patch Changes

- 202eaa3: Evolu Relay storage made stateless

  Timestamp insertion strategy state moved from in-memory Map to evolu_usage table. This makes Evolu Relay fully stateless and suitable for serverless environments like AWS Lambda and Cloudflare Workers with Durable Objects.

  The evolu_usage table must be read and written on every message write anyway (for quota checks), so it's natural to use it also for tracking timestamp bounds.

  Evolu Relay is designed to work everywhere SQLite works, and with little effort, also with any other SQL database. The core logic is implemented in the language which is very fast and where data is, which is why it's not Rust but SQL 🤓

- eed43d5: Add firstInArray and lastInArray helpers

  New helpers for safely accessing the first and last elements of non-empty arrays. Both functions work with `NonEmptyReadonlyArray` to guarantee type-safe access without runtime checks.

## 6.0.1-preview.30

### Patch Changes

- e2547d2: isOwnerWithinQuota is required, improve docs
- 05fe5d5: Renaming
  - `CallbackRegistry` → `Callbacks`
  - `createCallbackRegistry` → `createCallbacks`
  - `RefCountedResourceManager` → `Resources`
  - `createRefCountedResourceManager` → `createResources`
  - `ResourceManagerConfig` → `ResourcesConfig`

## 6.0.1-preview.29

### Patch Changes

- 36af10c: Improved Array helpers

  Evolu Array helpers for type-safe immutable operations have been improved. See [Array](https://www.evolu.dev/docs/api-reference/common/Array) docs.

- 91c132c: Multiton → Instances

  Multiton has been renamed to Instances with improved API and documentation.
  - `createMultiton` → `createInstances`
  - `disposeInstance` → `delete`
  - Enhanced error handling with AggregateError for multiple disposal failures
  - Clearer documentation focusing on practical use cases (mutexes, hot reloading)

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

- 13b688f: Add MaybeAsync type and isAsync type guard

  `MaybeAsync<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This pattern provides performance benefits by avoiding microtask overhead for synchronous operations while maintaining composability.

  `isAsync()` is a type guard to check if a MaybeAsync value is async, allowing conditional await only when necessary.

## 6.0.1-preview.28

### Patch Changes

- 7216d47: Add Multiton

  Multiton manages multiple named instances using a key-based registry with structured disposal. It's used internally for Evolu instance caching to support hot reloading and prevent database corruption from multiple connections.

  See the Multiton documentation for usage patterns and caveats.

## 6.0.1-preview.27

### Patch Changes

- a957aa0: Refactor React Native package structure and remove react-native-quick-base64 dependency

  **Breaking Changes:**
  - Package exports reorganized: use `/expo-sqlite`, `/expo-op-sqlite`, or `/bare-op-sqlite` instead of `/expo-sqlite` and `/op-sqlite`
  - Updated quickstart documentation to reflect new import paths

  **@evolu/react-native:**
  - Reorganized package structure with exports in dedicated `/exports` directory
  - Move SQLite driver implementations into `/sqlite-drivers` directory
  - Created shared dependency initialization in `shared.ts`
  - Removed `react-native-quick-base64` dependency (no longer needed)
  - Added `createExpoDeps.ts` for Expo-specific configuration including SecureStore integration
  - Updated `package.json` exports to include three entry points:
    - `/expo-sqlite` - for Expo projects using expo-sqlite
    - `/expo-op-sqlite` - for Expo projects using @op-engineering/op-sqlite
    - `/bare-op-sqlite` - for bare React Native projects using @op-engineering/op-sqlite
  - Reorganized imports following project guidelines (named imports, top-down organization)

  **@evolu/common:**
  - Added `Platform.ts` module with platform detection utilities
  - Refactored `LocalAuth.ts` constants to follow naming conventions:
    - `AUTH_NAMESPACE` → `localAuth_Namespace`
    - `AUTH_DEFAULT_OPTIONS` → `localAuthDefaultOptions`
    - `AUTH_METAKEY_LAST_OWNER` → `localAuthMetakeyLastOwner` (private)
    - `AUTH_METAKEY_OWNER_NAMES` → `localAuthMetakeyOwnerNames` (private)

  **Documentation:**
  - Updated quickstart guide to remove `react-native-quick-base64` from installation instructions
  - Simplified Expo setup warnings and instructions
  - Updated React Native import example to use `/bare-op-sqlite` path

## 6.0.1-preview.26

### Patch Changes

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- 02e8aa0: Evolu identicons

  Added `createIdenticon` function for generating visually distinct SVG identicons from Evolu `Id` (including branded IDs like `OwnerId`, etc.). For user avatars, visual identity markers, and differentiating entities in UI without storing images.

  ### Features
  - **Multiple styles**: Choose from 4 styles:
    - `"github"` (default): 5×5 grid with horizontal mirroring, inspired by GitHub avatars
    - `"quadrant"`: 2×2 color block grid with direct RGB mapping
    - `"gradient"`: Diagonal stripe pattern with smooth color gradients
    - `"sutnar"`: Ladislav Sutnar-inspired compositional design with adaptive colors
  - **SVG output**: Returns SVG string that can be used directly

  ### Example

  ```ts
  import { createIdenticon } from "@evolu/common";

  // Basic usage with default GitHub style
  const svg = createIdenticon(userId);

  const quadrant = createIdenticon(ownerId, "quadrant");
  const gradient = createIdenticon(postId, "gradient");
  const sutnar = createIdenticon(teamId, "sutnar");
  ```

- 31d0d21: Add Cache module with generic cache interface and LRU cache implementation
  - New `Cache<K, V>` interface with `has`, `get`, `set`, `delete` methods
  - New `createLruCache` factory function for creating LRU caches with configurable capacity
  - Keys are compared by reference (standard Map semantics)
  - LRU cache automatically evicts least recently used entries when capacity is reached
  - Both `get` and `set` operations update access order
  - Exposes readonly `map` property for iteration and inspection

  Example:

  ```ts
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // Evicts "a"
  cache.has("a"); // false
  ```

## 6.0.1-preview.25

### Patch Changes

- 29886ff: Add Standard Schema V1 support

  [Evolu Type](http://localhost:3000/docs/api-reference/common/Type) now supports [Standard Schema](https://standardschema.dev/) V1, enabling interoperability with 40+ validation-compatible tools and frameworks.

  ```ts
  const User = object({
    name: NonEmptyTrimmedString100,
    age: Number,
  });

  const result = User["~standard"].validate({
    name: "Alice",
    age: "not a number",
  });
  // {
  //   issues: [
  //     {
  //       message: 'A value "not a number" is not a number.',
  //       path: ["age"],
  //     },
  //   ],
  // }
  ```

  All error messages have been standardized for consistency.

## 6.0.1-preview.24

### Patch Changes

- 1d8c439: Add `orNull` method to Evolu Type

  Returns the validated value or `null` on failure. Useful when the error is not important and you just want the value or nothing.

  ```ts
  const age = PositiveInt.orNull(userInput) ?? 0;
  ```

## 6.0.1-preview.23

### Patch Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export

## 6.0.1-preview.22

### Patch Changes

- 446eac5: Remove dead code comments and improve tests
  - Simplify JSDoc for `loadQuery` to focus on current behavior (caching for Suspense)
  - Add note about SSR behavior to `appOwner`
  - Improve `createEvolu` JSDoc with clearer description and instance caching behavior
  - Improve tests to use proper async/await patterns and avoid mock libraries
  - Add comprehensive test coverage for query loading, subscriptions, and cache behavior

## 6.0.1-preview.21

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

## 6.0.1-preview.20

### Patch Changes

- eec5d8e: Add Task, async helpers, and concurrency primitives
  - `Task<T, E>` - Lazy, cancellable Promise that returns typed Result instead of throwing
  - `toTask()` - Convert async functions to Tasks with AbortSignal support
  - `wait()` - Delay execution with Duration strings (e.g., "5m", "2h 30m")
  - `timeout()` - Add timeout behavior to any Task
  - `retry()` - Retry failed operations with exponential backoff and jitter
  - `createSemaphore()` - Limit concurrent operations to a specified count
  - `createMutex()` - Ensure mutual exclusion (one operation at a time)

  **Duration Support:**
  - Type-safe duration strings with compile-time validation
  - Support for milliseconds, seconds, minutes, hours, and days
  - Logical combinations like "1h 30m" or "2s 500ms"

  Tasks provide precise type safety for cancellation - AbortError is only included in the error union when an AbortSignal is actually provided. All operations are designed to work together seamlessly for complex async workflows.

  ## Examples

  ### toTask

  ```ts
  // Convert an async function to a Task<Result<T, E>> with AbortSignal support
  const fetchTask = (url: string) =>
    toTask((context) =>
      tryAsync(
        () => fetch(url, { signal: context?.signal ?? null })
        (error) => ({ type: "FetchError", error }),
      ),
    );

  const result = await fetchTask("/api")(/* optional: { signal } */);
  ```

  ### wait

  ```ts
  // Delay for a duration string or NonNegativeInt milliseconds
  await wait("50ms")();
  ```

  ### timeout

  ```ts
  const slow = toTask(async () => ok("done"));
  const withTimeout = timeout("200ms", slow);
  const r = await withTimeout(); // Result<string, TimeoutError>
  ```

  ### retry

  ```ts
  interface FetchError {
    readonly type: "FetchError";
    readonly error: unknown;
  }
  const task = fetchTask("/api");
  const withRetry = retry({ retries: PositiveInt.orThrow(3) }, task);
  const r = await withRetry(); // Result<Response, FetchError | RetryError<FetchError>>
  ```

  ### createSemaphore

  ```ts
  const semaphore = createSemaphore(3);
  const run = (i: number) =>
    semaphore.withPermit(() => wait("50ms")().then(() => i));
  const results = await Promise.all([1, 2, 3, 4, 5].map(run)); // [1,2,3,4,5]
  ```

  ### createMutex

  ```ts
  const mutex = createMutex();
  const seq = (i: number) =>
    mutex.withLock(async () => {
      await wait("10ms")();
      return i;
    });
  const results = await Promise.all([1, 2, 3].map(seq)); // executes one at a time
  ```

- eec5d8e: Replace Mnemonic with OwnerSecret

  OwnerSecret is the fundamental cryptographic primitive from which all owner keys are derived via SLIP-21. Mnemonic is just a representation of this underlying entropy. This change makes the type system more accurate and the cryptographic relationships clearer.

- eec5d8e: Replace NanoID with Evolu Id

  Evolu now uses its own ID format instead of NanoID:
  - **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
  - **Breaking change**: ID format changes from 21 to 22 characters
  - **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID (128 bits vs ~126 bits), and native Base64Url encoding support across platforms

  See the `Id` type documentation for detailed design rationale comparing to NanoID, UUID v4, and UUID v7.

- eec5d8e: Replace `subscribeAppOwner` and `getAppOwner` with `appOwner` promise

  The app owner is now accessed via a promise (`evolu.appOwner`) instead of subscription-based methods. This simplifies the API and aligns with modern async patterns.

  **Breaking changes:**
  - Removed `evolu.subscribeAppOwner()` and `evolu.getAppOwner()`
  - Removed `useAppOwner()` hook from `@evolu/react`
  - Added `evolu.appOwner` promise that resolves to `AppOwner`
  - Updated `appOwnerState()` in `@evolu/svelte` to return promise-based state

  **Migration:**

  ```ts
  // Before
  const unsubscribe = evolu.subscribeAppOwner(() => {
    const owner = evolu.getAppOwner();
  });

  // After
  const owner = await evolu.appOwner;
  ```

  For React, use the `use` hook:

  ```ts
  // Before
  import { useAppOwner } from "@evolu/react";
  const appOwner = useAppOwner();

  // After
  import { use } from "react";
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);
  ```

- eec5d8e: # Transport-Based Configuration System

  # Transport-Based Configuration System

  **BREAKING CHANGE**: Replaced `syncUrl` with flexible `transport` property supporting single transport or array of transports for multiple sync endpoints.

  ## What Changed
  - **Removed** `syncUrl` property from Evolu config
  - **Added** `transport` property accepting a single `Transport` object or array of `Transport` objects
  - **Added** `Transport` type union with initial WebSocket support
  - **Updated** sync system to support Nostr-style relay pools with simultaneous connections
  - **Updated** all examples and documentation to use new transport configuration

  ## Migration Guide

  **Before:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    syncUrl: "wss://relay.example.com",
  });
  ```

  **After (single transport):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: { type: "WebSocket", url: "wss://relay.example.com" },
  });
  ```

  **After (multiple transports):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: [
      { type: "WebSocket", url: "wss://relay1.example.com" },
      { type: "WebSocket", url: "wss://relay2.example.com" },
    ],
  });
  ```

  ## Benefits
  - **Single or multiple relay support**: Use one transport for simplicity or multiple for redundancy
  - **Intuitive API**: Singular property name that accepts both single item and array
  - **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
  - **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously when using arrays
  - **Type safety**: Full TypeScript support for transport configurations

  ## Future Transport Types

  The new system is designed to support upcoming transport types:
  - `FetchRelay`: HTTP-based polling for environments without WebSocket support
  - `Bluetooth`: P2P sync for offline collaboration
  - `LocalNetwork`: LAN/mesh sync for local networks

  ## Technical Details
  - Single transports are automatically normalized to arrays internally
  - CRDT messages are sent to all connected transports simultaneously
  - Duplicate message handling relies on CRDT idempotency (no deduplication needed)
  - WebSocket connections auto-reconnect independently
  - Backwards compatibility removed (preview version breaking change)

  This change provides an intuitive API that scales from simple single-transport setups to complex multi-transport configurations, positioning Evolu for a more resilient, multi-transport future.

## 6.0.1-preview.19

### Patch Changes

- a2551db: Add deriveSlip21Node

## 6.0.1-preview.18

### Patch Changes

- 2f30dcd: Update deps
- 4a82c06: Improve getOrThrow: throw a standard Error with `cause` instead of stringifying the error.
  - Before: `new Error(`Result error: ${JSON.stringify(err)}`)`
  - After: `new Error("getOrThrow failed", { cause: err })`

  Why:
  - Preserve structured business errors for machine parsing via `error.cause`.
  - Avoid brittle stringified error messages and preserve a proper stack trace.

  Migration:
  - If you matched error messages, switch to inspecting `error.cause`.

## 6.0.1-preview.17

### Patch Changes

- 6eca947: Replace initialData with onInit callback
  - Remove `initialData` function from Config interface
  - Add `onInit` callback with `isFirst` parameter for one-time initialization
  - Simplify database initialization by removing pre-init data handling
  - Provide better control over initialization lifecycle

## 6.0.1-preview.16

### Patch Changes

- af1e668: # Owners refactor and external AppOwner support

  ## 🚀 Features
  - **External AppOwner Support**: `AppOwner` can now be created from external keys without sharing the mnemonic with the Evolu app. The `mnemonic` property is now optional, allowing for better security when integrating with external authentication systems.
  - **New Config Option**: Added `initialAppOwner` configuration option to specify a pre-existing AppOwner when creating an Evolu instance, replacing the previous `mnemonic` option for better encapsulation.

  ## 🔄 Breaking Changes
  - **Owner API Redesign**: Complete refactor of the Owner system with cleaner, more focused interfaces:
    - Simplified `Owner` interface with only essential properties (`id`, `encryptionKey`, `writeKey`)
    - Removed temporal properties (`createdAt`, `timestamp`) from core Owner interface
    - Eliminated complex `OwnerRow` and `OwnerWithWriteAccess` types
  - **Database Schema Changes**:
    - Replaced `evolu_owner` table with streamlined `evolu_config` table
    - New `evolu_version` table for protocol versioning
    - Simplified storage of AppOwner data in single config row
  - **Configuration Changes**:
    - `Config.mnemonic` replaced with `Config.initialAppOwner`
    - More explicit control over owner initialization

  ## ✨ Improvements
  - **Enhanced Documentation**: Comprehensive JSDoc with clear explanations of owner types, use cases, and examples
  - **Clock Management**: New internal clock system for better timestamp handling
  - **Test Coverage**: Extensive test suite covering all owner types and edge cases

  ## 🔧 Internal Changes
  - **Database Initialization**: Refactored database setup to use new schema with better separation of concerns
  - **Protocol Updates**: Updated to protocol version 0 with new storage format

## 6.0.1-preview.15

### Patch Changes

- 6452d57: Non-initiator always responds in sync protocol for completion feedback

  The non-initiator (relay/server) now always responds to sync requests, even when there's no data to send, by returning an empty message (19 bytes). This enables reliable sync completion detection for initiators (clients).

## 6.0.1-preview.14

### Patch Changes

- 0911302: Enhance message integrity by embedding timestamps in encrypted data
  - Add timestamp tamper-proofing to encrypted CRDT messages by embedding the timestamp within the encrypted payload
  - Update `encodeAndEncryptDbChange` to accept `CrdtMessage` instead of `DbChange` and include timestamp in encrypted data
  - Update `decryptAndDecodeDbChange` to verify embedded timestamp matches expected timestamp
  - Add `ProtocolTimestampMismatchError` for timestamp verification failures
  - Export `eqTimestamp` equality function for timestamp comparison
  - Add `timestampBytesLength` constant for consistent binary timestamp size
  - Fix `Db.ts` to pass complete `CrdtMessage` to encryption functions
  - Add test for timestamp tamper-proofing scenarios

  This security enhancement prevents tampering with message timestamps by cryptographically binding them to the encrypted change data, ensuring message integrity and preventing replay attacks with modified timestamps.

- 3daa221: Add protocol versioning to EncryptedDbChange

  Protocol version is now encoded as the first field in EncryptedDbChange binary format. This enables safe evolution of the format while maintaining backward compatibility.

## 6.0.1-preview.13

### Patch Changes

- c4fb4b0: Docs for insert, update, and upsert methods
- e213d63: Improve createdAt handling in mutations

  This release enhances the handling of the `createdAt` column in Evolu mutations, providing more flexibility for data migrations and external system integrations while maintaining distributed system semantics.

  ### Changes

  **createdAt Behavior:**
  - `insert`: Always sets `createdAt` to current timestamp
  - `upsert`: Sets `createdAt` to current timestamp if not provided, or uses custom value if specified
  - `update`: Never sets `createdAt` (unchanged behavior)

  **Documentation Improvements:**
  - Updated JSDoc for `DefaultColumns` with clear explanations of each column's behavior
  - Clarified that `updatedAt` is always set by Evolu and derived from CrdtMessage timestamp
  - Added guidance for using custom timestamp columns when deferring sync for privacy
  - Enhanced mutation method documentation with practical examples

  ### Example

  ```ts
  evolu.upsert("todo", {
    id: externalId,
    title: "Migrated todo",
    createdAt: new Date("2023-01-01"), // Preserve original timestamp
  });
  ```

## 6.0.1-preview.12

### Patch Changes

- 3e824af: Refactor createIdFromString, add tests

## 6.0.1-preview.11

### Patch Changes

- 6279aea: Add external ID support with `createIdFromString` function
  - Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
  - Add optional branding support to both `createId` and `createIdFromString` functions
  - Update FAQ documentation with external ID integration examples
  - Add tests for new functionality

  This enables deterministic ID generation from external systems while maintaining Evolu's 21-character NanoID format requirement and ensuring consistent conflict resolution across distributed clients.

## 6.0.1-preview.10

### Patch Changes

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

## 6.0.1-preview.9

### Patch Changes

- 7283ca1: Don't rethrow the decode error

## 6.0.1-preview.8

### Patch Changes

- 04ca08f: Update default syncUrl

## 6.0.1-preview.7

### Patch Changes

- f5e4232: Added deleteOwner(ownerId) method to the Storage interface and implementations, enabling complete removal of all data for a given owner, including timestamps, messages, and write keys.

## 6.0.1-preview.6

### Patch Changes

- 7cd78bf: Added WriteKey rotation protocol support
  - Added WriteKeyMode enum for protocol header (None/Single/Rotation)
  - Updated protocol message structure with separate initiator/non-initiator headers
  - Added createProtocolMessageForWriteKeyRotation function
  - Added storage interface setWriteKey method

## 6.0.1-preview.5

### Patch Changes

- c86cb14: Add timing-safe comparison for WriteKey validation

  ### Security Improvements
  - Add `TimingSafeEqual` type and `TimingSafeEqualDep` interface for platform-independent timing-safe comparison
  - Implement Node.js timing-safe comparison using `crypto.timingSafeEqual()`
  - Replace vulnerable `eqArrayNumber` WriteKey comparison with constant-time algorithm to prevent timing attacks

## 6.0.1-preview.4

### Patch Changes

- 4cc79bb: Added compile-time schema validation with clear error messages
  - Added ValidateSchema type that validates Evolu schemas at compile-time and returns readable error messages instead of cryptic TypeScript errors
  - Schema validation now enforces:
    - All tables must have an 'id' column
    - The 'id' column must be a branded ID type (created with id() function)
    - Tables cannot use default column names (createdAt, updatedAt, isDeleted)
    - All column types must be compatible with SQLite (extend SqliteValue)
  - Enhanced developer experience with actionable error messages like "❌ Schema Error: Table 'todo' is missing required id column"
  - Added test coverage for all validation scenarios

## 6.0.1-preview.3

### Patch Changes

- 2a37317: Update dependencies
- 39cbd9b: Add ownerId into evolu_history table

## 6.0.1-preview.2

### Patch Changes

- 8ff21e5: GitHub release

## 6.0.1-preview.1

### Patch Changes

- de37bd1: Add ownerId to all protocol errors (except ProtocolInvalidDataError) and update version negotiation to always include ownerId.
  - Improved protocol documentation for versioning and error handling.
  - Improved E2E tests for protocol version negotiation.
  - Ensured all protocol errors (except for malformed data) are associated with the correct owner.

## 6.0.1-preview.0

### Patch Changes

- 632768f: Preview release

## 6.0.0

### Major Changes

- Major architectural overhaul:
  - Removed Effect dependency, introduced Evolu Library
  - New binary protocol with RBSR sync for efficient peer-to-peer synchronization
  - Message chunking and improved mutation API
  - Binary database change padding for enhanced privacy
  - Foundation for upcoming ephemeral messages, redacted deletion, and collaboration features
  - TODO: write more descriptive changelog.

## 5.4.0

### Minor Changes

- 19f7d85: Update peer dependencies @effect/platform, @effect/schema

## 5.3.0

### Minor Changes

- ab24e09: Experimental Websocket integration and realtime updates.

  It's only for Evolu Server for now.

### Patch Changes

- c63a2b8: @effect/platform 0.59

## 5.2.3

### Patch Changes

- 91298f3: @effect/platform 0.58

## 5.2.2

### Patch Changes

- 08758d8: @effect/schema 0.68

## 5.2.1

### Patch Changes

- 2183e61: Updated @effect/platform dependency

## 5.2.0

### Minor Changes

- e420fec: New API for working with Evolu instances

  The functions `resetOwner` and `restoreOwner` automatically reload the app to ensure no user data remains in memory. The new option `reload` allows us to opt out of this default behavior. For that reason, both functions return a promise that can be used to provide custom UX. There is also a new `reloadApp` function to reload the app in a platform-specific way (e.g., browsers will reload all tabs with Evolu instances).

  The `createEvolu` function has a new option, `mnemonic`. This option is useful for Evolu multitenancy when creating an Evolu instance with a predefined mnemonic. To create a mnemonic, use the new `createMnemonic` function.

## 5.1.4

### Patch Changes

- f1a8bcd: Update @effect/platform

## 5.1.3

### Patch Changes

- 8e519ca: Update peerDependencies

## 5.1.2

### Patch Changes

- 657262c: Update deps

## 5.1.1

### Patch Changes

- 5b6419a: Schema 0.67

## 5.1.0

### Minor Changes

- 79a6d0c: Time Travel

  Evolu does not delete data; it only marks them as deleted. This is because local-first is a distributed system. There is no central authority (if there is, it's not local-first). Imagine you delete data on some disconnected device and update it on another. Should we throw away changes? Such a deletion would require additional logic to enforce data deletion on all devices forever, even in the future, when some outdated device syncs. It's possible (and planned for Evolu), but it's not trivial because every device has to track data to be rejected without knowing the data itself (for security reasons).

  Not deleting data allows Evolu to provide a time-traveling feature. All data, even "deleted" or overridden, are stored in the evolu_message table. Here is how we can read such data.

  ```ts
  const todoTitleHistory = (id: TodoId) =>
    evolu.createQuery((db) =>
      db
        .selectFrom("evolu_message")
        .select("value")
        .where("table", "==", "todo")
        .where("row", "==", id)
        .where("column", "==", "title")
        .$narrowType<{ value: TodoTable["title"] }>()
        .orderBy("timestamp", "desc"),
    );
  ```

  Note that this API is not 100% typed, but it's not an issue because Evolu Schema shall be append-only. Once an app is released, we shall not change Schema names and types. We can only add new tables and columns because there is a chance current Schema is already used.

## 5.0.3

### Patch Changes

- e8f293f: Add exportDatabase

## 5.0.2

### Patch Changes

- 2b0b8bf: Fix bug

  It was a silly typo; sorry about that. Ironically, tests didn't catch it because that was the one test I didn't port after refactoring. My bad. We will add more tests in the future.

## 5.0.1

### Patch Changes

- af02cf8: Effect is stable, but the platform and schema aren't yet

## 5.0.0

### Major Changes

- d156e67: Multitenancy, stable Effect, refactoring, logging

  Greetings. I spent the last few weeks refactoring Evolu. There are no breaking changes except for one function name. It's a major change because with such a significant refactoring, I can't be 100 % sure I didn't break anything. The core logic remains unchanged, but Evolu uses the Effect library better. When Evolu started with Effect, the website didn't exist yet.

  The initial reason for refactoring Evolu was that I wasn't satisfied with the Web Workers wrapper. I tried Comlink. It's a great library, but it has flaws, as documented in a new ProxyWorker, a lightweight Comlink tailored for Effect. While Effect provides an excellent wrapper for workers, I wanted to try a Comlink-like API. Such a change was a chance to review how Evolu uses Effect, and I realized I used too many Layers for no reason.

  During refactoring, I realized it would be nice if Evolu could run more instances concurrently. So, Evolu now supports multitenancy 🙂.

  I wasn't satisfied with the initial data definition, so I added an API for that, too. And logging. If you are curious about what's happening within Evolu, try the new `minimumLogLevel` Config option. There are also a few minor improvements inside the core logic. Again, there are no breaking changes; it is just better and more readable source code.

  The great news is that Effect is stable now, so there will be no more releases with deps updates. Let's dance 🪩

  New features:
  - Multitenancy (we can run more Evolu instances side by side)
  - Initial data (to define fixtures)
  - Logging (you can see what's happening inside Evolu step by step)
  - Faster and safer DB access (we use shared transactions for reads and special "last" transaction mode for resetting)
  - Stable Effect 🎉

- 30d2a40: `createIndex` replaced with `createIndexes`

  That's why it's a breaking change—a slight change in API. Everything else is backward compatible. Evolu is stable for many major versions.

### Minor Changes

- 69bcf80: Update the minimal TypeScript version to 5.4

## 4.1.1

### Patch Changes

- a0d1e3c: Add config logSql option
- 0afb614: Update Effect and Schema

## 4.1.0

### Minor Changes

- 8af071c: Indexes (or indices, we don't judge)

  This release brings SQLite indexes support to Evolu with two helpful options for `evolu.createQuery` functions.

  ```ts
  const indexes = [
    createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
  ];

  const evolu = createEvolu(Database, {
    // Try to remove/re-add indexes with `logExplainQueryPlan`.
    indexes,
  });

  const allTodos = evolu.createQuery(
    (db) => db.selectFrom("todo").orderBy("createdAt").selectAll(),
    {
      logExecutionTime: true,
      // logExplainQueryPlan: false,
    },
  );
  ```

  Indexes are not necessary for development but are recommended for production.

  Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
  createQuery options.

  SQLite has [a tool](https://sqlite.org/cli.html#index_recommendations_sqlite_expert_) for index recommendations.

## 4.0.5

### Patch Changes

- 6e61bb9: Update Effect and Schema

  Rename `Schema.To` to `Schema.Type`.

  All Effect Schema changes are [here](https://github.com/Effect-TS/effect/blob/main/packages/schema/WHATSNEW-0.64.md).

## 4.0.4

### Patch Changes

- 9f92715: Effect 2.4.3, Schema 0.63.4

## 4.0.3

### Patch Changes

- d5038ba: Update Kysely for TypeScript 5.4

## 4.0.2

### Patch Changes

- 1f9168f: Fix SSR

  Evolu server-side rendering was surprisingly problematic because of the React Suspense error: "This Suspense boundary received an update before it finished hydrating."

  If you are curious why a local-first library needs to render something on the server where there is no data, the answer is that if we can render empty rows, we should.

  But because of the React Suspense error, Evolu apps had to be wrapped by the ClientOnly component, which wasn't ideal. Check article:

  https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store

  Internally, PlatformName has been replaced with useWasSSR React Hook.

## 4.0.1

### Patch Changes

- aa06cbe: Allow using Kysely `with` and `withRecursive`

  And throw on forbidden SQL mutations.

## 4.0.0

### Major Changes

- 2fe4e16: Add Config name property and remove LocalStorage support.

  It's a breaking change only because PlatformName was restricted. There is no change in sync protocol so that all data can be safely restored.

### Patch Changes

- 01d2554: Update peer dependencies

## 3.1.8

### Patch Changes

- 01d2554: Update peer deps

## 3.1.7

### Patch Changes

- 888b83e: Add platformName property to Evolu.

## 3.1.6

### Patch Changes

- ccd699a: Fix #333

## 3.1.5

### Patch Changes

- f6e198a: Effect 2.40.0, Schema 0.63.0

## 3.1.4

### Patch Changes

- 1cf6502: Update Effect and Schema

## 3.1.3

### Patch Changes

- 106462c: Update Effect and Schema

  Note API change: https://github.com/Effect-TS/effect/releases/tag/effect%402.3.0

## 3.1.2

### Patch Changes

- a59be92: Update Effect and Schema

## 3.1.1

### Patch Changes

- b337e70: Update Effect and Schema

## 3.1.0

### Minor Changes

- ef32952: Add createOrUpdate

  This function is useful when we already have an `id` and want to create a
  new row or update an existing one.

  ```ts
  import * as S from "effect/Schema";
  import { Id } from "@evolu/react";

  // Id can be stable.
  // 2024-02-0800000000000
  const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;

  evolu.createOrUpdate("todo", { id, title });
  ```

## 3.0.15

### Patch Changes

- 621f3a3: Update deps: Effect, Schema, sqlite-wasm, nanoid, better-sqlite3

## 3.0.14

### Patch Changes

- f1d76d3: Effect 2.2.2 and Schema 0.61.2

  Schema parse renamed to decodeUnknown.

## 3.0.13

### Patch Changes

- 369ff8b: Update peer deps

## 3.0.12

### Patch Changes

- b9e549a: Effect 2.1.2 and Schema 0.60.6

## 3.0.11

### Patch Changes

- ffb503b: Effect 2.1.0 and Schema 0.60.3

## 3.0.10

### Patch Changes

- 3cd5c71: Update deps

## 3.0.9

### Patch Changes

- ff6254b: Update Effect and Schema peer dependencies

  Effect 2 isn't still considered stable; breaking changes can happen in minor versions. Effect 3 will be stable. No worries, they are only tuning APIs.

## 3.0.8

### Patch Changes

- 047b92e: Update Kysely to 0.27.0

  Check [Kysely release](https://github.com/kysely-org/kysely/releases/tag/0.27.0)

  Note simplified `$narrowType` usage. Previous:

  ```ts
  .$narrowType<{ title: NonEmptyString1000 }>()
  ```

  Simplified:

  ```ts
  .$narrowType<{ title: NotNull }>()
  ```

## 3.0.7

### Patch Changes

- a2068f2: Use namespace imports

  Namespace imports make dev faster and build smaller for bundlers without three shaking.

  https://www.effect.website/docs/essentials/importing

## 3.0.6

### Patch Changes

- 1b4e331: Update Effect and Schema peer dependencies

  If you are curious why Effect and Schema peer dependencies must be updated on every release, the reason is that Effect isn't version 2 yet. Hence, it must be pinned to the same version.

## 3.0.5

### Patch Changes

- ac609e1: Update Schema peer dependency

## 3.0.4

### Patch Changes

- e6abac0: Update Effect and Schema deps

## 3.0.3

### Patch Changes

- ebbe716: Export QueryResult type

## 3.0.2

### Patch Changes

- 16d7d5b: Update deps

## 3.0.1

### Patch Changes

- a969843: Add ExtractRow type helper

  Extract `Row` from `Query` instance.

  ```ts
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  type AllTodosRow = ExtractRow<typeof allTodos>;
  ```

## 3.0.0

### Major Changes

- d289ac7: Improve table and database schema DX.

  In the previous Evolu version, table and database schemas were created with `S.struct` and validated with createEvolu. Because of how the TypeScript compiler works, type errors were incomprehensible.

  We added two new helper functions to improve a DX: `table` and `database`.

  Previous schema definition:

  ```ts
  const TodoTable = S.struct({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = S.struct({
    todo: TodoTable,
  });
  ```

  New schema definition:

  ```ts
  const TodoTable = table({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = database({
    todo: TodoTable,
  });
  ```

  Those two helpers also detect missing ID columns and the usage of reserved columns.

  This update is a breaking change because reserved columns (createdAt, updatedAt, isDeleted) are created with `table` function now.

## 2.2.4

### Patch Changes

- eb819cb: Rename Schema to DatabaseSchema
- 92448d6: Update peer deps

## 2.2.3

### Patch Changes

- 215662c: Update deps

## 2.2.2

### Patch Changes

- 33974aa: Fix number protobuf serialization

## 2.2.1

### Patch Changes

- 98e19f0: Update deps

## 2.2.0

### Minor Changes

- bc18e74: Add the sync function

  Evolu syncs on every mutation, tab focus, and network reconnect, so it's generally not required to sync manually, but if you need it, you can do it.

  ```ts
  evolu.sync();
  ```

## 2.1.0

### Minor Changes

- 1eef638: Add makeCreateEvolu factory

## 2.0.6

### Patch Changes

- b00dec2: Update deps

## 2.0.5

### Patch Changes

- b06757c: Update readme

## 2.0.4

### Patch Changes

- 4563ec0: Bump peer dependants

## 2.0.3

### Patch Changes

- 59ec99c: Update @evolu/common peer dependencies

## 2.0.2

### Patch Changes

- ddd4014: Update readme

## 2.0.1

### Patch Changes

- fea7623: Fix SSR

## 2.0.0

### Major Changes

- 7e80483: New API

  With the upcoming React 19 `use` Hook, I took a chance to review and improve the Evolu API. I moved as many logic and types as possible to the Evolu interface to make platform variants more lightweight and to allow the use of Evolu directly out of any UI library.

  The most significant change is the split of SQL query declaration and usage. The rest of the API is almost identical except for minor improvements and one removal: filterMap helper is gone.

  It was a good idea with a nice DX, but such ad-hoc migrations belong in the database, not the JavaScript code. Filtering already loaded data pulls excessive data that should stay in the database. The good news is we can do that and even better with Kysely.

  To refresh what we are talking about for Evolu newcomers. Because database schema is evolving, and we can't do classical migrations in local-first apps (because we don't delete and other CRDT stuff), Evolu adopted GraphQL schema-less everything-is-nullable pattern.

  Having nullable everywhere in code is not ideal DX, so it would be nice to filter, ensure non-nullability, and even map rows directly in the database. Surprisingly, SQL is capable of that. Expect Evolu DSL for that soon. Meanwhile, we can do that manually:

  ```ts
  const todosWithout = evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", Evolu.cast(true))
      // Filter null value and ensure non-null type. Evolu will provide a helper.
      .where("title", "is not", null)
      .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
      .orderBy("createdAt"),
  );
  ```

  And now to the new API. Behold:

  ```ts
  // Create queries.
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  const todoById = (id: TodoId) =>
    evolu.createQuery((db) =>
      db.selectFrom("todo").selectAll().where("id", "=", id),
    );

  // We can load a query or many queries.
  const allTodosPromise = evolu.loadQuery(allTodos).then(({ rows }) => {
    console.log(rows);
  });
  evolu.loadQueries([allTodos, todoById(1)]);

  // useQuery can load once or use a promise.
  const { rows } = useQuery(allTodos);
  const { rows } = useQuery(allTodos, { once: true });
  const { rows } = useQuery(allTodos, { promise: allTodosPromise });
  const { row } = useQuery(todoById(1));
  ```

  I also refactored (read: simplified) the usage of Effect Layers across all libraries. And the last thing: There is no breaking change in data storage or protocol.

## 1.0.17

### Patch Changes

- 22f6085: Update deps

## 1.0.16

### Patch Changes

- 08839c9: Update deps

## 1.0.15

### Patch Changes

- db84a4e: Update deps
- 51ead17: Make useQuery filterMap optional and reusable

## 1.0.14

### Patch Changes

- 242d7e5: Experimental new feature: Local only tables

  A local-only table is a table prefixed with "\_" that will never be synced—a small but handy addition. Imagine editing huge JSON. Should we store it on any change or allow the user to "commit" data later? In an ideal world, we would have CRDT abstraction for any data, and we will have, but for now, we can postpone or even cancel sync with local-only tables. Another use-case is device-only data, for example, some settings that should not be shared with other devices. Local-only tables also allow real deletion. Use the isDeleted common column and the row will be deleted instead of marked as deleted.

## 1.0.13

### Patch Changes

- 9d319e5: Rename canUseDOM to canUseDom

## 1.0.12

### Patch Changes

- 094e25a: Expose and leverage canUseDOM

## 1.0.11

### Patch Changes

- 8f7c8c8: Dedupe messages created within the microtask queue

  That's only for a case where someone accidentally calls mutate with the same values repeatedly. There is no reason to create identical messages.

## 1.0.10

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

## 1.0.9

### Patch Changes

- ad267b4: Update deps

## 1.0.8

### Patch Changes

- 3f89e12: Update deps

## 1.0.7

### Patch Changes

- a938b3d: Update deps

## 1.0.6

### Patch Changes

- 43ae617: Update peer dependencies

## 1.0.5

### Patch Changes

- 0b53b45: Update deps

## 1.0.4

### Patch Changes

- ac05ef2: Update deps

## 1.0.3

### Patch Changes

- c406a60: Update deps

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency

## 1.0.1

### Patch Changes

- 21f41b0: Update deps

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries
