/**
 * Platform-agnostic Console for Chrome 123+, Firefox 125+, Safari 18.1+,
 * Node.js 22.x+, and React Native 0.75+. Includes methods guaranteed to be
 * available in these environments and expected to remain compatible in future
 * versions. Output formatting may vary (e.g., interactive UI in browsers vs.
 * text in Node.js/React Native), but functionality is consistent across
 * platforms.
 *
 * **Convention**: Use a tag (e.g., `[db]`) as the first argument for log
 * filtering.
 *
 * ### Example
 *
 * ```ts
 * deps.console.log("[evolu]", "createEvoluInstance", { name });
 * ```
 *
 * **Tip**: In browser dev tools, you can filter logs by tag (e.g., `[db]`) to
 * quickly find relevant messages. In Node.js, use `grep` to filter output:
 *
 * ```bash
 * node app.js | grep "\[relay\]"         # Show only relay logs
 * node app.js | grep -E "\[db\]|\[sql\]" # Show db and sql logs
 * node app.js | grep -v "\[debug\]"      # Hide debug logs
 * ```
 *
 * Or add to package.json scripts:
 *
 * ```json
 * {
 *   "scripts": {
 *     "dev:relay": "node app.js | grep \"\\[relay\\]\"",
 *     "dev:db": "node app.js | grep -E \"\\[db\\]|\\[sql\\]\""
 *   }
 * }
 * ```
 */
export interface Console {
  /** Controls whether console methods produce output (default: true) */
  enabled?: boolean;

  /** Outputs a message to the console */
  log: (...args: Array<any>) => void;

  /** Outputs an informational message (often same as log) */
  info: (...args: Array<any>) => void;

  /** Outputs a warning message */
  warn: (...args: Array<any>) => void;

  /** Outputs an error message */
  error: (...args: Array<any>) => void;

  /** Outputs a debug message */
  debug: (...args: Array<any>) => void;

  /** Starts a timer with an optional label */
  time: (label?: string) => void;

  /** Logs the elapsed time for a timer without ending it */
  timeLog: (label?: string, ...data: Array<any>) => void;

  /** Ends a timer and logs the elapsed time */
  timeEnd: (label?: string) => void;

  /** Displays an object's properties in a detailed format */
  dir: (object: any, options?: any) => void;

  /** Displays tabular data as a table */
  table: (tabularData: any, properties?: Array<string>) => void;

  /** Logs the number of times this has been called with the given label */
  count: (label?: string) => void;

  /** Resets the counter for the given label */
  countReset: (label?: string) => void;

  /** Writes a message if the value is falsy, otherwise does nothing */
  assert: (value: any, message?: string, ...optionalParams: Array<any>) => void;

  /** Prints a stack trace with an optional message */
  trace: (message?: any, ...optionalParams: Array<any>) => void;
}

/** Dependency interface for injecting a Console instance. */
export interface ConsoleDep {
  readonly console: Console;
}

export interface ConsoleConfig {
  /**
   * Enable or disable console logging (default: false). When true, logs are
   * output to the {@link Console}; when false, logging is disabled for all
   * methods except `error`, which always outputs to ensure critical issues are
   * not missed.
   */
  readonly enableLogging?: boolean;
}

/** Creates a {@link Console} for logging with configurable output. */
export const createConsole = (config: ConsoleConfig = {}): Console => {
  const instance: Console = {
    enabled: config.enableLogging ?? false,

    log: (...args) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.log(...args);
    },
    info: (...args) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.info(...args);
    },
    warn: (...args) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.warn(...args);
    },
    error: (...args) => {
      // Always log errors, even if disabled
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      console.error(...args);
    },
    debug: (...args) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.debug(...args);
    },
    time: (label) => {
      // eslint-disable-next-line no-console
      if (instance.enabled) console.time(label);
    },
    timeLog: (label, ...data) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.timeLog(label, ...data);
    },
    timeEnd: (label) => {
      // eslint-disable-next-line no-console
      if (instance.enabled) console.timeEnd(label);
    },
    dir: (object, options) => {
      // eslint-disable-next-line no-console
      if (instance.enabled) console.dir(object, options);
    },
    table: (tabularData, properties) => {
      // eslint-disable-next-line no-console
      if (instance.enabled) console.table(tabularData, properties);
    },
    count: (label) => {
      // eslint-disable-next-line no-console
      if (instance.enabled) console.count(label);
    },
    countReset: (label) => {
      // eslint-disable-next-line no-console
      if (instance.enabled) console.countReset(label);
    },
    assert: (value, message, ...optionalParams) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.assert(value, message, ...optionalParams);
    },
    trace: (message, ...optionalParams) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.trace(message, ...optionalParams);
    },
  };

  return instance;
};

export interface ConsoleWithTimeConfig extends ConsoleConfig {
  /**
   * Type of timestamp to prepend to log messages.
   *
   * - 'absolute': Shows actual time (e.g., "14:32:15.234")
   * - 'relative': Shows time since console creation (e.g., "+1.234s")
   */
  readonly timestampType: "absolute" | "relative";
}

/** Creates a console instance with timestamp prefixes. */
export const createConsoleWithTime = (
  config: ConsoleWithTimeConfig = { timestampType: "relative" },
): Console => {
  const console = createConsole(config);
  const startTime = performance.now();

  const getTimestamp = (): string => {
    if (config.timestampType === "relative") {
      const elapsed = (performance.now() - startTime) / 1000;

      // Format for better readability at different time scales
      if (elapsed < 60) {
        // Under 1 minute: show seconds with millisecond precision
        return `+${elapsed.toFixed(3)}s`;
      } else if (elapsed < 3600) {
        // 1 minute to 1 hour: show minutes and seconds with millisecond precision
        const minutes = Math.floor(elapsed / 60);
        const seconds = (elapsed % 60).toFixed(3);
        return `+${minutes}m${seconds}s`;
      } else {
        // Over 1 hour: show hours, minutes, and seconds with millisecond precision
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = ((elapsed % 3600) % 60).toFixed(3);
        return `+${hours}h${minutes}m${seconds}s`;
      }
    } else {
      // Absolute time - format as HH:MM:SS.mmm
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");
      const milliseconds = now.getMilliseconds().toString().padStart(3, "0");
      return `${hours}:${minutes}:${seconds}.${milliseconds}`;
    }
  };

  const withTimestamp =
    (fn: (...args: Array<any>) => void) =>
    (...args: Array<any>) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      fn(`[${getTimestamp()}]`, ...args);
    };

  // Override methods that should have timestamps
  console.log = withTimestamp(console.log);
  console.info = withTimestamp(console.info);
  console.warn = withTimestamp(console.warn);
  console.error = withTimestamp(console.error);
  console.debug = withTimestamp(console.debug);
  console.trace = withTimestamp(console.trace);

  return console;
};
