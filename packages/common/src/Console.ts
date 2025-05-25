/**
 * 📝 Cross-Platform Console
 *
 * Console abstraction for Chrome 123+, Firefox 125+, Safari 18.1+, Node.js
 * 22.x+, and React Native 0.75+. Includes methods guaranteed to be available in
 * these environments and expected to remain compatible in future versions.
 * Output formatting may vary (e.g., interactive UI in browsers vs. text in
 * Node.js/React Native), but functionality is consistent across platforms.
 *
 * **Warning**: If you encounter platform-specific issues or missing methods,
 * please contribute a PR with details about the environment and behavior.
 *
 * @module
 */

/**
 * Cross-platform Console interface for Chrome 123+, Firefox 125+, Safari 18.1+,
 * Node.js 22.x+, and React Native 0.75+
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

  /** Logs the elapsed time for a timer without ending it */
  timeLog: (label?: string, ...data: Array<any>) => void;

  /** Prints a stack trace with an optional message */
  trace: (message?: any, ...optionalParams: Array<any>) => void;
}

/** Dependency interface for injecting a Console instance. */
export interface ConsoleDep {
  readonly console: Console;
}

export interface ConsoleConfig {
  /**
   * Enable or disable console logging. When true, logs are output to the
   * {@link Console}; when false, logging is disabled for all methods except
   * `error`, which always outputs to ensure critical issues are not missed.
   * Default is false.
   */
  readonly enableLogging?: boolean;
}

/** Creates a console instance using the global console. */
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
    timeLog: (label, ...data) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.timeLog(label, ...data);
    },
    trace: (message, ...optionalParams) => {
      // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-argument
      if (instance.enabled) console.trace(message, ...optionalParams);
    },
  };

  return instance;
};
