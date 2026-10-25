// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../packages/react-native/src/ErrorUtils.d.ts";
import { constVoid, type ConsoleDep } from "../../packages/common/src/index.ts";
import type { EvoluDeps } from "../../packages/common/src/local-first/index.ts";
import { createNodeJsSqliteDriver } from "../../packages/nodejs/src/Sqlite.ts";
import { createEvoluDeps as createInProcessEvoluDeps } from "../../packages/react-native/src/shared.ts";

/**
 * Relays are unreachable from documentation examples, so an example that keeps
 * the default transports runs offline instead of syncing with a real relay.
 * Evolu stops connecting when the WebSocket constructor throws.
 */
class UnreachableWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor() {
    throw new Error("Documentation examples do not connect to relays.");
  }
}

globalThis.WebSocket = UnreachableWebSocket as unknown as typeof WebSocket;

/**
 * Creates Evolu dependencies for documentation examples, which Node.js runs in
 * one process. The shared worker and database workers run in-process, as on
 * React Native, over in-memory SQLite, which needs the addon that
 * `testEvoluJSDocExamples` builds.
 */
export const createDocsEvoluDeps = (
  deps: Partial<ConsoleDep> = {},
): EvoluDeps =>
  createInProcessEvoluDeps({
    ...(deps.console && { console: deps.console }),
    createSqliteDriver: (name) =>
      createNodeJsSqliteDriver(name, { mode: "memory" }),
    reloadApp: constVoid,
  });
