import * as Kysely from "kysely";
import { ConsoleConfig } from "../Console.js";
import { getOrThrow } from "../Result.js";
import { SimpleName } from "../Type.js";
import type { AppOwner } from "./Owner.js";

export interface Config extends ConsoleConfig {
  /**
   * The name of the Evolu instance. Evolu is multitenant - it can run multiple
   * instances concurrently. Each instance must have a unique name.
   *
   * The instance name is used as the SQLite database filename for persistent
   * storage, ensuring that database files are separated and invisible to each
   * other.
   *
   * The default value is: `Evolu`.
   *
   * ### Example
   *
   * ```ts
   * // name: getOrThrow(SimpleName.from("MyApp"))
   * ```
   */
  readonly name: SimpleName;

  /**
   * Transport configuration for data sync and backup. Supports single transport
   * or multiple transports simultaneously for redundancy.
   *
   * Currently supports:
   *
   * - WebSocket: Real-time bidirectional communication with relay servers
   *
   * The default value is:
   *
   * `{ type: "WebSocket", url: "wss://free.evoluhq.com" }`.
   *
   * ### Example
   *
   * ```ts
   * // Single WebSocket relay
   * transports: [{ type: "WebSocket", url: "wss://relay1.example.com" }];
   *
   * // Multiple WebSocket relays for redundancy
   * transports: [
   *   { type: "WebSocket", url: "wss://relay1.example.com" },
   *   { type: "WebSocket", url: "wss://relay2.example.com" },
   *   { type: "WebSocket", url: "wss://relay3.example.com" },
   * ];
   *
   * // Local-only instance (no sync) - useful for device settings
   * transports: [];
   * ```
   */
  readonly transports: ReadonlyArray<TransportConfig>;

  /**
   * URL to reload browser tabs after reset or restore.
   *
   * The default value is `/`.
   */
  readonly reloadUrl: string;

  /**
   * Maximum physical clock drift allowed in ms.
   *
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  readonly maxDrift: number;

  /**
   * Use the `indexes` option to define SQLite indexes.
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * ### Example
   *
   * ```ts
   * const evolu = createEvolu(evoluReactDeps)(Schema, {
   *   indexes: (create) => [
   *     create("todoCreatedAt").on("todo").column("createdAt"),
   *     create("todoCategoryCreatedAt")
   *       .on("todoCategory")
   *       .column("createdAt"),
   *   ],
   * });
   * ```
   */
  readonly indexes?: IndexesConfig;

  /**
   * External AppOwner to use when creating Evolu instance. Use this when you
   * want to manage AppOwner creation and persistence externally (e.g., with
   * your own authentication system). If omitted, Evolu will automatically
   * create and persist an AppOwner locally.
   *
   * For device-specific settings and account management state, we can use a
   * separate local-only Evolu instance via `transports: []`.
   *
   * ### Example
   *
   * ```ts
   * const ConfigId = id("Config");
   * type ConfigId = typeof ConfigId.Type;
   *
   * const DeviceSchema = {
   *   config: {
   *     id: ConfigId,
   *     key: NonEmptyString50,
   *     value: NonEmptyString50,
   *   },
   * };
   *
   * // Local-only instance for device settings (no sync)
   * const deviceEvolu = createEvolu(evoluReactWebDeps)(DeviceSchema, {
   *   name: getOrThrow(SimpleName.from("MyApp-Device")),
   *   transports: [], // No sync - stays local to device
   * });
   *
   * // Main synced instance for user data
   * const evolu = createEvolu(evoluReactWebDeps)(MainSchema, {
   *   name: getOrThrow(SimpleName.from("MyApp")),
   *   // Default transports for sync
   * });
   * ```
   */
  readonly externalAppOwner?: AppOwner;

  /**
   * Use in-memory SQLite database instead of persistent storage. Useful for
   * testing or temporary data that doesn't need persistence.
   *
   * In-memory databases exist only in RAM and are completely destroyed when the
   * process ends, making them forensically safe for sensitive data.
   *
   * The default value is: `false`.
   */
  readonly inMemory?: boolean;
}

export interface ConfigDep {
  readonly config: Config;
}

// DEV: Future transports: Bluetooth, LocalNetwork, etc.
export type TransportConfig = WebSocketTransportConfig;

export interface WebSocketTransportConfig {
  readonly type: "WebSocket";
  readonly url: string;
}

export type IndexesConfig = (
  create: (indexName: string) => Kysely.CreateIndexBuilder,
) => ReadonlyArray<Kysely.CreateIndexBuilder<any>>;

export const defaultConfig: Config = {
  name: getOrThrow(SimpleName.from("Evolu")),
  transports: [{ type: "WebSocket", url: "wss://free.evoluhq.com" }],
  reloadUrl: "/",
  maxDrift: 5 * 60 * 1000,
  enableLogging: false,
};
