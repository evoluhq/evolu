import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as LogLevel from "effect/LogLevel";
import * as Logger from "effect/Logger";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Match from "effect/Match";
import type { Index } from "./Sqlite.js";

export interface Config {
  /**
   * Use the `indexes` property to define SQLite indexes.
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * @example
   *   const indexes = [
   *     createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
   *
   *     createIndex("indexTodoCategoryCreatedAt")
   *       .on("todoCategory")
   *       .column("createdAt"),
   *   ];
   */
  indexes: ReadonlyArray<Index>;

  /**
   * URL to reload browser tabs after {@link Owner} reset or restore.
   *
   * The default value is `/`.
   */
  reloadUrl: string;

  /**
   * URL for Evolu sync and backup server
   *
   * The default value is `https://evolu.world`.
   */
  syncUrl: string;

  /**
   * Evolu application name. For now, this is only useful for localhost
   * development, where we want each application to have its own database.
   *
   * The default value is: `Evolu`.
   */
  name: string;

  /**
   * Maximum physical clock drift allowed in ms.
   *
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  maxDrift: number;

  /**
   * Setting the minimum log level. The default value is `none`.
   *
   * For development, use `trace` to log all events and `debug` to log only
   * events with values. For production, use `warning`.
   */
  minimumLogLevel: "none" | "trace" | "debug" | "warning";
}

export const Config = Context.GenericTag<Config>("Config");

const defaultConfig: Config = {
  indexes: [],
  reloadUrl: "/",
  syncUrl: "https://evolu.world",
  name: "Evolu",
  maxDrift: 5 * 60 * 1000,
  minimumLogLevel: "none",
};

/** https://effect.website/docs/guides/runtime */
export const createEvoluRuntime = (
  config?: Partial<Config>,
): ManagedRuntime.ManagedRuntime<Config, never> => {
  const mergedConfig = { ...defaultConfig, ...config };
  const ConfigLive = Layer.succeed(Config, mergedConfig);

  const minimumLogLevel = Match.value(mergedConfig.minimumLogLevel).pipe(
    Match.when("debug", () => LogLevel.Debug),
    Match.when("none", () => LogLevel.None),
    Match.when("trace", () => LogLevel.Trace),
    Match.when("warning", () => LogLevel.Warning),
    Match.exhaustive,
  );

  const evoluLayer =
    mergedConfig.minimumLogLevel === "none"
      ? ConfigLive
      : Layer.merge(Logger.minimumLogLevel(minimumLogLevel), ConfigLive);

  return ManagedRuntime.make(evoluLayer);
};

// import * as Context from "effect/Context";
// import * as Layer from "effect/Layer";
// import { CreateIndexBuilder } from "kysely";

// export interface Config {
//   /**
//    * Use the `indexes` property to define SQLite indexes.
//    *
//    * Table and column names are not typed because Kysely doesn't support it.
//    *
//    * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
//    *
//    * @example
//    *   const indexes = [
//    *     createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
//    *
//    *     createIndex("indexTodoCategoryCreatedAt")
//    *       .on("todoCategory")
//    *       .column("createdAt"),
//    *   ];
//    */
//   readonly indexes: ReadonlyArray<CreateIndexBuilder<any>>;

//   /** Log SQL. */
//   readonly logSql: boolean;

//   /**
//    * Alternate URL to reload browser tabs after {@link Owner} reset or restore.
//    * The default value is `/`.
//    */
//   readonly reloadUrl: string;

//   /** Alternate URL for Evolu sync and backup server. */
//   readonly syncUrl: string;

//   /**
//    * Evolu application name. For now, this is only useful for localhost
//    * development, where we want each application to have its own database. The
//    * default value is: "Evolu".
//    */
//   readonly name: string;

//   /**
//    * Maximum physical clock drift allowed in ms. The default value is 5 * 60 *
//    * 1000 (5 minutes).
//    */
//   readonly maxDrift: number;
// }

// export const Config = Context.GenericTag<Config>("@services/Config");

// const defaultConfig: Config = {
//   indexes: [],
//   logSql: false,
//   reloadUrl: "/",
//   syncUrl: "https://evolu.world",
//   name: "Evolu",
//   maxDrift: 5 * 60 * 1000,
// };

// export const ConfigLive = (config?: Partial<Config>): Layer.Layer<Config> =>
//   Layer.succeed(Config, Config.of({ ...defaultConfig, ...config }));
