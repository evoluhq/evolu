/**
 * Platform-agnostic console with structured logging.
 *
 * @module
 */

import { objectFrom } from "./Object.js";
import type { ReadonlyStore } from "./Store.js";
import { createStore } from "./Store.js";
import type { Task } from "./Task.js";
import {
  createTime,
  formatMillisAsClockTime,
  formatMillisAsDuration,
  type Millis,
  type TimeDep,
} from "./Time.js";

/**
 * Platform-agnostic console with structured logging.
 *
 * Captures structured log entries and routes them to configurable outputs.
 * Provides methods guaranteed to be available across browsers, Node.js, and
 * React Native.
 *
 * Key features:
 *
 * - Structured entries — logs are captured as {@link ConsoleEntry} objects with
 *   method, path, and args
 * - Pluggable outputs — route logs to console, files, arrays, or custom
 *   destinations via {@link ConsoleOutput}
 * - Child consoles — use {@link Console.child} to create derived consoles
 * - Level filtering — see {@link ConsoleLevel} for severity ordering
 * - Entry formatting — use {@link createConsoleFormatter} for timestamps and path
 *   prefixes
 *
 * Built-in outputs:
 *
 * - {@link createNativeConsoleOutput} — writes to `globalThis.console` (default)
 * - {@link createConsoleArrayOutput} — captures entries to an array (testing)
 * - {@link createConsoleStoreOutput} — stores latest entry in a
 *   {@link ReadonlyStore} for subscribing
 * - {@link createMultiOutput} — fans out to multiple outputs
 *
 * ### Example
 *
 * ```ts
 * // Basic usage - defaults to "log"
 * const console = createConsole();
 *
 * // With formatting (timestamps and path prefixes)
 * const console = createConsole({
 *   level: "info",
 *   formatter: createConsoleFormatter()({ timestampFormat: "relative" }),
 * });
 *
 * // Children inherit level at creation, then are independent
 * const console = run.deps.console.child("relay");
 * console.setLevel("silent");
 *
 * // Tip: Wrap logged values in objects for labeled output in DevTools
 * console.info("Creating instance", { config }); // Good — expandable "config:" label
 * console.info("Creating instance", config); // Avoid — anonymous object, no label
 *
 * // Batch update via children
 * const setLevelRecursive = (c: Console, level: ConsoleLevel): void => {
 *   c.setLevel(level);
 *   for (const child of c.children) setLevelRecursive(child, level);
 * };
 * ```
 *
 * Console intentionally does not use {@link Task}. Logging must be as fast as
 * possible and always work, even during error handling or shutdown.
 *
 * For testing, use {@link testCreateConsole} which creates a {@link TestConsole}
 * with array output and snapshot helpers.
 *
 * @see {@link createConsole}
 */
export interface Console {
  /** Name of this console. Empty for root. */
  readonly name: string;

  /** Child consoles created via {@link Console.child}. */
  readonly children: ReadonlySet<Console>;

  /**
   * Returns the effective log level.
   *
   * If this console has its own level set via {@link Console.setLevel}, returns
   * that. Otherwise returns the inherited level from creation time.
   */
  readonly getLevel: () => ConsoleLevel;

  /**
   * Sets the log level for this console.
   *
   * Pass a level to override the inherited level, or `null` to revert to the
   * inherited level.
   */
  readonly setLevel: (level: ConsoleLevel | null) => void;

  /** Returns true if this console has its own level set (not inherited). */
  readonly hasOwnLevel: () => boolean;

  /**
   * Creates a child console with the given name added to the path.
   *
   * Child inherits the parent's configured level (not any runtime override).
   * Use {@link Console.children} to access all children for batch operations.
   */
  readonly child: (name: string) => Console;

  /** Outputs a stack trace. */
  readonly trace: (...args: ReadonlyArray<unknown>) => void;

  /** Development diagnostics. */
  readonly debug: (...args: ReadonlyArray<unknown>) => void;

  /** General-purpose messages. */
  readonly log: (...args: ReadonlyArray<unknown>) => void;

  /** Operational milestones (startup, shutdown). */
  readonly info: (...args: ReadonlyArray<unknown>) => void;

  /** Recoverable issues that may need attention. */
  readonly warn: (...args: ReadonlyArray<unknown>) => void;

  /** Failures requiring immediate attention. */
  readonly error: (...args: ReadonlyArray<unknown>) => void;

  /** Displays an object with expandable properties. Level: debug. */
  readonly dir: (item: unknown) => void;

  /** Displays tabular data. Level: debug. */
  readonly table: (data: unknown) => void;

  /** Starts a timer with the given label. Level: debug. */
  readonly time: (label: string) => void;

  /** Logs elapsed time for a timer. Level: debug. */
  readonly timeLog: (label: string, ...args: ReadonlyArray<unknown>) => void;

  /** Ends a timer and logs elapsed time. Level: debug. */
  readonly timeEnd: (label: string) => void;

  /** Increments and logs a counter. Level: debug. */
  readonly count: (label?: string) => void;

  /** Resets a counter. Level: debug. */
  readonly countReset: (label?: string) => void;

  /**
   * Writes a pre-built {@link ConsoleEntry} directly to the output, bypassing
   * level filtering. Used to replay entries from another context (e.g., a
   * SharedWorker) where filtering was already applied.
   */
  readonly write: (entry: ConsoleEntry) => void;
}

export interface ConsoleDep {
  readonly console: Console;
}

/**
 * Log level controlling which messages are output.
 *
 * Setting a level enables all logs at that level and above (ordered by
 * severity):
 *
 * - `"trace"` — Stack traces and detailed execution flow
 * - `"debug"` — Development diagnostics, timers, counters
 * - `"log"` — General-purpose messages
 * - `"info"` — Operational milestones (startup, shutdown)
 * - `"warn"` — Recoverable issues that may need attention
 * - `"error"` — Failures requiring immediate attention
 * - `"silent"` — Disables all logging
 */
export type ConsoleLevel =
  | "trace"
  | "debug"
  | "log"
  | "info"
  | "warn"
  | "error"
  | "silent";

/**
 * Structured log entry captured by {@link Console}.
 *
 * Contains all information needed for outputs to route the log: method for
 * routing, path for context, and the original arguments.
 */
export interface ConsoleEntry {
  /** The console method that was called. */
  readonly method: ConsoleMethod;

  /** Hierarchical path from {@link Console.child} calls (e.g., ["relay", "db"]). */
  readonly path: ReadonlyArray<string>;

  /** Original arguments passed to the console method. */
  readonly args: ReadonlyArray<unknown>;
}

/**
 * Console method being called.
 *
 * Used in {@link ConsoleEntry} to identify which console method was invoked.
 * Outputs can route or format differently based on the method.
 */
export type ConsoleMethod =
  | "trace"
  | "debug"
  | "log"
  | "info"
  | "warn"
  | "error"
  | "dir"
  | "table"
  | "time"
  | "timeLog"
  | "timeEnd"
  | "count"
  | "countReset";

/**
 * Output destination for {@link Console}.
 *
 * Implement this interface to create custom log destinations (file, network,
 * array for testing, etc.).
 *
 * Use {@link createNativeConsoleOutput} for native console output.
 */
export interface ConsoleOutput {
  /** Write a log entry to this output. */
  readonly write: (entry: ConsoleEntry, formatter?: ConsoleFormatter) => void;
}

/**
 * Transforms a {@link ConsoleEntry} before output.
 *
 * Used by {@link ConsoleConfig.formatter} and {@link ConsoleOutput.write}. Create
 * one with {@link createConsoleFormatter}.
 */
export type ConsoleFormatter = (entry: ConsoleEntry) => ReadonlyArray<unknown>;

/** Configuration for {@link createConsole}. */
export interface ConsoleConfig {
  /** Name of this console. Defaults to empty string. */
  readonly name?: string;

  /** Initial log level. Defaults to `"log"`. */
  readonly level?: ConsoleLevel;

  /**
   * Output destination for log entries. Defaults to
   * {@link createNativeConsoleOutput}.
   */
  readonly output?: ConsoleOutput;

  /** Path prefix for this console. Defaults to `[]`. */
  readonly path?: ReadonlyArray<string>;

  /**
   * Transforms entry args before writing (e.g., adds timestamps, path
   * prefixes).
   *
   * Receives the entry and returns modified args. Use
   * {@link createConsoleFormatter} for common formatting options.
   */
  readonly formatter?: ConsoleFormatter;
}

/** Configuration for {@link createConsoleFormatter}. */
export interface ConsoleFormatterConfig {
  /**
   * Timestamp format to prepend to log messages.
   *
   * - `"relative"` — elapsed since start: `+0.000s`, `+1.500s`, `+1m30.000s`
   * - `"absolute"` — local clock time: `14:32:15.234`
   * - `"iso"` — ISO 8601 UTC: `2026-01-28T14:30:00.123Z`
   * - `"none"` — no timestamp (default)
   */
  readonly timestampFormat?: ConsoleEntryTimestampFormat;

  /**
   * Start time for relative timestamps. Defaults to first entry timestamp.
   *
   * Pass a {@link Millis} value to use a custom start time, useful when multiple
   * consoles should share the same relative timeline.
   */
  readonly startTime?: Millis;
}

/** Timestamp format for {@link ConsoleFormatterConfig}. */
export type ConsoleEntryTimestampFormat =
  | "relative"
  | "absolute"
  | "iso"
  | "none";

/**
 * A {@link ConsoleOutput} that stores the latest entry in a
 * {@link ReadonlyStore}.
 *
 * Subscribe to {@link ConsoleStoreOutput.entry} to observe all log entries.
 *
 * ### Example
 *
 * ```ts
 * const storeOutput = createConsoleStoreOutput();
 * const console = createConsole({ output: storeOutput });
 *
 * storeOutput.entry.subscribe(() => {
 *   const entry = storeOutput.entry.get();
 *   if (entry) forwardToClient(entry);
 * });
 * ```
 */
export interface ConsoleStoreOutput extends ConsoleOutput {
  /** Latest entry written to this output. */
  readonly entry: ReadonlyStore<ConsoleEntry | null>;
}

/**
 * Dependency providing the latest {@link ConsoleEntry} from a
 * {@link ConsoleStoreOutput}.
 */
export interface ConsoleStoreOutputEntryDep {
  readonly consoleStoreOutputEntry: ReadonlyStore<ConsoleEntry | null>;
}

/**
 * A test console that captures all output for assertions.
 *
 * Use as a drop-in replacement for {@link Console} in tests.
 */
export interface TestConsole extends Console {
  /** Gets all captured entries and clears the internal buffer. */
  readonly getEntriesSnapshot: () => ReadonlyArray<ConsoleEntry>;

  /** Clears all captured entries. */
  readonly clearEntries: () => void;
}

export interface TestConsoleDep {
  readonly console: TestConsole;
}

const levelOrder: Record<ConsoleLevel, number> = {
  trace: 0,
  debug: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
  silent: 6,
};

/** Creates a {@link Console}. */
export const createConsole = ({
  name = "",
  level = "log",
  output = createNativeConsoleOutput(),
  path = [],
  formatter,
}: ConsoleConfig = {}): Console => {
  const childrenSet = new Set<Console>();
  let ownLevel: ConsoleLevel | null = null;

  const getLevel = (): ConsoleLevel => ownLevel ?? level;

  const createMethod =
    (
      method: ConsoleMethod,
      methodLevel: ConsoleLevel,
      formatter?: ConsoleFormatter,
    ) =>
    (...args: ReadonlyArray<unknown>): void => {
      if (levelOrder[methodLevel] >= levelOrder[getLevel()])
        output.write({ method, path, args }, formatter);
    };

  const levelMethod = (method: ConsoleLevel & ConsoleMethod) =>
    createMethod(method, method, formatter);

  const debugMethod = (method: ConsoleMethod) => createMethod(method, "debug");

  return {
    name,
    children: childrenSet,
    getLevel,
    setLevel: (level) => {
      ownLevel = level;
    },
    hasOwnLevel: () => ownLevel !== null,

    child: (name) => {
      const childConsole = createConsole({
        name,
        level,
        output,
        path: [...path, name],
        ...(formatter && { formatter }),
      });
      childrenSet.add(childConsole);
      return childConsole;
    },

    ...objectFrom(
      ["trace", "debug", "log", "info", "warn", "error"],
      levelMethod,
    ),
    ...objectFrom(
      ["dir", "table", "time", "timeLog", "timeEnd", "count", "countReset"],
      debugMethod,
    ),

    write: (entry) => {
      output.write(entry, formatter);
    },
  };
};

/**
 * Creates a {@link ConsoleOutput} that writes to `globalThis.console`.
 *
 * Pure transport - just calls the native console method with the entry args.
 * Use {@link createConsoleFormatter} with {@link ConsoleConfig.formatter} for
 * timestamps and path prefixes.
 *
 * ### Example
 *
 * ```ts
 * const output = createNativeConsoleOutput();
 * ```
 */
export const createNativeConsoleOutput = (): ConsoleOutput => ({
  write: (entry, formatter) => {
    const args = formatter ? formatter(entry) : entry.args;
    const fn = globalThis.console[entry.method] as (
      ...args: Array<unknown>
    ) => void;
    fn(...args);
  },
});

/**
 * Creates a {@link ConsoleFormatter} for {@link ConsoleConfig.formatter}.
 *
 * Prepends timestamps and path prefixes to entry args.
 *
 * ### Example
 *
 * ```ts
 * const root = createConsole({
 *   formatter: createConsoleFormatter()({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * // Relative — elapsed since start
 * const relay = root.child("relay");
 * relay.log("connected"); // +0.000s [relay] connected
 * relay.log("synced"); // +1.500s [relay] synced
 *
 * // Nested children
 * const db = relay.child("db");
 * db.log("opened"); // +1.500s [relay] [db] opened
 *
 * // Absolute — local clock time (HH:MM:SS.mmm)
 * // relay.log("connected"); // 15:30:15.123 [relay] connected
 * ```
 */
export const createConsoleFormatter =
  ({ time = createTime() }: Partial<TimeDep> = {}) =>
  (config: ConsoleFormatterConfig = {}): ConsoleFormatter => {
    const format = config.timestampFormat ?? "none";
    let startTime = config.startTime;

    return (entry) => {
      const now = time.now();
      startTime ??= now;

      let timestamp: string;
      switch (format) {
        case "none":
          timestamp = "";
          break;
        case "relative":
          timestamp = `+${formatMillisAsDuration((now - startTime) as Millis)}`;
          break;
        case "absolute":
          timestamp = formatMillisAsClockTime(now);
          break;
        case "iso":
          timestamp = new globalThis.Date(now).toISOString();
          break;
      }

      const path =
        entry.path.length > 0 ? entry.path.map((p) => `[${p}]`).join(" ") : "";

      const prefix =
        timestamp && path ? `${timestamp} ${path}` : timestamp || path;
      return prefix ? [prefix, ...entry.args] : entry.args;
    };
  };

/** Creates a {@link ConsoleStoreOutput}. */
export const createConsoleStoreOutput = (): ConsoleStoreOutput => {
  const entry = createStore<ConsoleEntry | null>(null);
  return {
    write: entry.set,
    entry,
  };
};

/**
 * Creates a {@link ConsoleOutput} that captures entries to an array.
 *
 * Useful for testing. Pass your own array to inspect captured entries.
 *
 * ### Example
 *
 * ```ts
 * const entries: Array<ConsoleEntry> = [];
 * const output = createConsoleArrayOutput(entries);
 *
 * // After logging...
 * expect(entries).toMatchInlineSnapshot();
 * ```
 */
export const createConsoleArrayOutput = (
  entries: Array<ConsoleEntry>,
): ConsoleOutput => ({
  write: (entry) => {
    entries.push(entry);
  },
});

/**
 * Creates a {@link ConsoleOutput} that fans out to multiple outputs.
 *
 * Each entry is written to all outputs in order. Useful for combining a native
 * console output with a store output for forwarding.
 *
 * ### Example
 *
 * ```ts
 * const storeOutput = createConsoleStoreOutput();
 * const console = createConsole({
 *   output: createMultiOutput([createNativeConsoleOutput(), storeOutput]),
 * });
 * ```
 */
export const createMultiOutput = (
  outputs: ReadonlyArray<ConsoleOutput>,
): ConsoleOutput => ({
  write: (entry, formatter) => {
    for (const output of outputs) output.write(entry, formatter);
  },
});

/**
 * Creates a {@link TestConsole} that captures all output for testing.
 *
 * Unlike {@link createConsole}, this doesn't require dependencies and uses a
 * simple incrementing counter for timestamps (starting at 0).
 *
 * ### Example
 *
 * ```ts
 * test("logging", () => {
 *   const console = testCreateConsole();
 *   console.info("Hello");
 *
 *   expect(console.getEntriesSnapshot()).toMatchInlineSnapshot(`
 *     [
 *       {
 *         "method": "info",
 *         "path": [],
 *         "args": ["Hello"]
 *       }
 *     ]
 *   `);
 * });
 *
 * test("level filtering", () => {
 *   const console = testCreateConsole({ level: "warn" });
 *   console.debug("ignored");
 *   console.warn("logged");
 *   expect(console.getEntriesSnapshot()).toHaveLength(1);
 * });
 * ```
 */
export const testCreateConsole = ({
  level = "trace",
}: {
  level?: ConsoleLevel;
} = {}): TestConsole => {
  const entries: Array<ConsoleEntry> = [];
  const console = createConsole({
    level,
    output: createConsoleArrayOutput(entries),
  });

  return {
    ...console,
    getEntriesSnapshot: () => {
      const snapshot = [...entries];
      entries.length = 0;
      return snapshot;
    },
    clearEntries: () => {
      entries.length = 0;
    },
  };
};
