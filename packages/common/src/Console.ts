/**
 * Platform-agnostic console with structured logging.
 *
 * @module
 */

import { objectFrom } from "./Object.js";
import type { Task } from "./Task.js";
import {
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
 * - Async support — buffer logs for high-throughput scenarios
 *
 * Log levels are ordered by severity: trace < debug < log < info < warn <
 * error. Setting a level enables all logs at that level and above. Use
 * `"silent"` to disable all logging.
 *
 * ### Example
 *
 * ```ts
 * const console = run.deps.console.child("relay");
 *
 * console.info("Started on port", 443); // logs
 * console.debug("Connection details", conn); // filtered out (debug < info)
 * ```
 *
 * Console intentionally does not use {@link Task}. Logging must be as fast as
 * possible and always work, even during error handling or shutdown when tasks
 * may not be available.
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

  /** Starts a timer with the given label. Level: debug. */
  readonly time: (label: string) => void;

  /** Logs elapsed time for a timer. Level: debug. */
  readonly timeLog: (label: string, ...args: ReadonlyArray<unknown>) => void;

  /** Ends a timer and logs elapsed time. Level: debug. */
  readonly timeEnd: (label: string) => void;

  /** Displays an object with expandable properties. Level: debug. */
  readonly dir: (item: unknown) => void;

  /** Displays tabular data. Level: debug. */
  readonly table: (data: unknown) => void;

  /** Increments and logs a counter. Level: debug. */
  readonly count: (label?: string) => void;

  /** Resets a counter. Level: debug. */
  readonly countReset: (label?: string) => void;

  /** General-purpose messages. */
  readonly log: (...args: ReadonlyArray<unknown>) => void;

  /** Operational milestones (startup, shutdown). */
  readonly info: (...args: ReadonlyArray<unknown>) => void;

  /** Recoverable issues that may need attention. */
  readonly warn: (...args: ReadonlyArray<unknown>) => void;

  /** Failures requiring immediate attention. */
  readonly error: (...args: ReadonlyArray<unknown>) => void;
}

/**
 * Log level controlling which messages are output.
 *
 * Levels are ordered by severity: trace < debug < log < info < warn < error.
 * Setting a level enables all logs at that level and above.
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

/** Dependency wrapper for {@link Console}. */
export interface ConsoleDep {
  readonly console: Console;
}

/** Configuration for {@link createConsole}. */
export interface ConsoleConfig {
  /** Name of this console. Defaults to empty string. */
  readonly name?: string;

  /**
   * Initial log level.
   *
   * Levels: trace < debug < log < info < warn < error < silent. Setting a level
   * enables all logs at that level and above.
   *
   * Defaults to `"log"`.
   */
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
   * {@link createConsoleEntryFormatter} for common formatting options.
   */
  readonly formatEntry?: (entry: ConsoleEntry) => ReadonlyArray<unknown>;
}

/**
 * Creates a {@link Console} with structured logging and pluggable outputs.
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
 *   formatEntry: createConsoleEntryFormatter({ time })({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * // Children inherit level at creation, then are independent
 * const relay = console.child("relay");
 * console.setLevel("silent"); // only console, relay keeps inherited level
 *
 * // Batch update via children
 * const setLevelRecursive = (c: Console, level: ConsoleLevel): void => {
 *   c.setLevel(level);
 *   for (const child of c.children) setLevelRecursive(child, level);
 * };
 * ```
 */
export const createConsole = ({
  name = "",
  level = "log",
  output = createNativeConsoleOutput(),
  path = [],
  formatEntry,
}: ConsoleConfig = {}): Console => {
  const childrenSet = new Set<Console>();
  let ownLevel: ConsoleLevel | null = null;

  const getLevel = (): ConsoleLevel => ownLevel ?? level;

  const write =
    (method: ConsoleMethod, methodLevel: ConsoleLevel, useFormatter: boolean) =>
    (...args: ReadonlyArray<unknown>): void => {
      if (levelOrder[methodLevel] >= levelOrder[getLevel()])
        output.write(
          { method, path, args },
          useFormatter ? formatEntry : undefined,
        );
    };

  const levelMethod = (method: ConsoleLevel & ConsoleMethod) =>
    write(method, method, true);

  const debugMethod = (method: ConsoleMethod) => write(method, "debug", false);

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
        ...(formatEntry && { formatEntry }),
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
  };
};

const levelOrder: Record<ConsoleLevel, number> = {
  trace: 0,
  debug: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
  silent: 6,
};

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
  readonly write: (
    entry: ConsoleEntry,
    formatEntry?: (entry: ConsoleEntry) => ReadonlyArray<unknown>,
  ) => void;

  /** Flush buffered entries. For async outputs that buffer for performance. */
  readonly flush?: () => Promise<void>;
}

/**
 * Structured log entry captured by {@link Console}.
 *
 * Contains all information needed for outputs route the log: method for
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
  | "log"
  | "info"
  | "warn"
  | "error"
  | "debug"
  | "trace"
  | "time"
  | "timeLog"
  | "timeEnd"
  | "dir"
  | "table"
  | "count"
  | "countReset";

/**
 * Creates a {@link ConsoleOutput} that writes to `globalThis.console`.
 *
 * Pure transport - just calls the native console method with the entry args.
 * Use {@link createConsoleEntryFormatter} with {@link ConsoleConfig.formatEntry}
 * for timestamps and path prefixes.
 *
 * ### Example
 *
 * ```ts
 * const output = createNativeConsoleOutput();
 * ```
 */
export const createNativeConsoleOutput = (): ConsoleOutput => ({
  write: (entry, formatEntry) => {
    const args = formatEntry ? formatEntry(entry) : entry.args;
    const fn = globalThis.console[entry.method] as (
      ...args: Array<unknown>
    ) => void;
    fn(...args);
  },
});

/** Configuration for {@link createConsoleEntryFormatter}. */
export interface ConsoleEntryFormatterConfig {
  /**
   * Timestamp format to prepend to log messages.
   *
   * - `"relative"`: Time since first entry (e.g., `+1.234s`)
   * - `"absolute"`: Clock time (e.g., `[14:32:15.234]`)
   * - `"iso"`: ISO 8601 format (e.g., `[2026-01-28T14:32:15.234Z]`)
   * - `"none"`: No timestamp (default)
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

/** Timestamp format for {@link ConsoleEntryFormatterConfig}. */
export type ConsoleEntryTimestampFormat =
  | "relative"
  | "absolute"
  | "iso"
  | "none";

/**
 * Creates a formatter for {@link ConsoleConfig.formatEntry}.
 *
 * Prepends timestamps and path prefixes to entry args.
 *
 * ### Example
 *
 * ```ts
 * const console = createConsole({
 *   level: "info",
 *   formatEntry: createConsoleEntryFormatter({ time })({
 *     timestampFormat: "relative",
 *   }),
 * });
 * ```
 */
export const createConsoleEntryFormatter =
  (deps: TimeDep) =>
  (
    config: ConsoleEntryFormatterConfig = {},
  ): ((entry: ConsoleEntry) => ReadonlyArray<unknown>) => {
    const format = config.timestampFormat ?? "none";
    let startTime = config.startTime;

    return (entry) => {
      const now = deps.time.now();
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

      const prefix = [timestamp, path].filter(Boolean).join(" ");
      return prefix ? [prefix, ...entry.args] : entry.args;
    };
  };

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
export const testCreateConsole = (config?: {
  readonly level?: ConsoleLevel;
}): TestConsole => {
  const entries: Array<ConsoleEntry> = [];
  const initialLevel = config?.level ?? "trace";

  const getEntriesSnapshot = (): ReadonlyArray<ConsoleEntry> => {
    const snapshot = [...entries];
    entries.length = 0;
    return snapshot;
  };

  const clearEntries = (): void => {
    entries.length = 0;
  };

  const createInstance = (
    path: ReadonlyArray<string>,
    instanceName: string,
    inheritedLevel: ConsoleLevel,
  ): TestConsole => {
    let ownLevel: ConsoleLevel | null = null;
    const childrenSet = new Set<Console>();

    const getLevel = (): ConsoleLevel => ownLevel ?? inheritedLevel;
    const setLevel = (level: ConsoleLevel | null): void => {
      ownLevel = level;
    };
    const hasOwnLevel = (): boolean => ownLevel !== null;

    const write = (
      method: ConsoleMethod,
      args: ReadonlyArray<unknown>,
    ): void => {
      entries.push({
        method,
        path,
        args,
      });
    };

    const writeIfLevel =
      (method: ConsoleMethod, methodLevel: ConsoleLevel) =>
      (...args: ReadonlyArray<unknown>): void => {
        if (levelOrder[methodLevel] >= levelOrder[getLevel()])
          write(method, args);
      };

    const writeRawDebug = (method: ConsoleMethod) =>
      writeIfLevel(method, "debug");

    const testConsole: TestConsole = {
      name: instanceName,
      children: childrenSet,
      getLevel,
      setLevel,
      hasOwnLevel,

      child: (childName) => {
        const childConsole = createInstance(
          [...path, childName],
          childName,
          inheritedLevel,
        );
        childrenSet.add(childConsole);
        return childConsole;
      },

      trace: writeIfLevel("trace", "trace"),
      debug: writeIfLevel("debug", "debug"),
      log: writeIfLevel("log", "log"),
      info: writeIfLevel("info", "info"),
      warn: writeIfLevel("warn", "warn"),
      error: writeIfLevel("error", "error"),

      time: writeRawDebug("time"),
      timeLog: writeRawDebug("timeLog"),
      timeEnd: writeRawDebug("timeEnd"),
      dir: writeRawDebug("dir"),
      table: writeRawDebug("table"),
      count: writeRawDebug("count"),
      countReset: writeRawDebug("countReset"),

      getEntriesSnapshot,
      clearEntries,
    };

    return testConsole;
  };

  return createInstance([], "", initialLevel);
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

// TODO: multiOutput - routes entries to different outputs by method
// TODO: asyncOutput - buffers entries for better performance
