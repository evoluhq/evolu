import { ConsoleConfig } from "../Console.js";
import { getOrThrow } from "../Result.js";
import { SimpleName } from "../Type.js";
import type { AppOwner } from "./Owner.js";
import type { DbIndexesBuilder } from "./Schema.js";
import type { Transport } from "./Transport.js";

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
   * Future transports will include:
   *
   * - FetchRelay: HTTP-based polling/push for environments without WebSocket
   *   support
   * - Bluetooth: P2P sync for offline collaboration
   * - LocalNetwork: LAN/mesh sync for local networks
   *
   * The default value is: `{ type: "WebSocket", url: "wss://free.evoluhq.com"
   * }`.
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
   * ```
   */
  readonly transports: ReadonlyArray<Transport>;

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
  readonly indexes?: DbIndexesBuilder;

  /**
   * Initial AppOwner to use when creating Evolu instance. If omitted, a new
   * AppOwner will be generated automatically.
   */
  readonly initialAppOwner?: AppOwner;

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

export const defaultConfig: Config = {
  name: getOrThrow(SimpleName.fromParent("Evolu")),
  transports: [{ type: "WebSocket", url: "wss://free.evoluhq.com" }],
  reloadUrl: "/",
  maxDrift: 5 * 60 * 1000,
  enableLogging: false,
};
