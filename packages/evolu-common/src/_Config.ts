import { Effect } from "effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as LogLevel from "effect/LogLevel";
import * as Logger from "effect/Logger";
import * as Runtime from "effect/Runtime";
import { CreateIndexBuilder } from "kysely";

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
  readonly indexes: ReadonlyArray<CreateIndexBuilder<any>>;

  /** Log SQL. */
  readonly logSql: boolean;

  /**
   * Alternate URL to reload browser tabs after {@link Owner} reset or restore.
   * The default value is `/`.
   */
  readonly reloadUrl: string;

  /** Alternate URL for Evolu sync and backup server. */
  readonly syncUrl: string;

  /**
   * Evolu application name. For now, this is only useful for localhost
   * development, where we want each application to have its own database. The
   * default value is: "Evolu".
   */
  readonly name: string;

  /**
   * Maximum physical clock drift allowed in ms. The default value is 5 * 60 *
   * 1000 (5 minutes).
   */
  readonly maxDrift: number;

  /**
   * Setting the minimum log level. The default value is `LogLevel.None`.
   *
   * https://effect.website/docs/guides/observability/logging
   */
  readonly minimumLogLevel: LogLevel.LogLevel;
}

export const Config = Context.GenericTag<Config>("Config");

const defaultConfig: Config = {
  indexes: [],
  logSql: false,
  reloadUrl: "/",
  syncUrl: "https://evolu.world",
  name: "Evolu",
  maxDrift: 5 * 60 * 1000,
  minimumLogLevel: LogLevel.None,
};

/** https://effect.website/docs/guides/runtime */
const createEvoluRuntime = (
  config?: Partial<Config>,
): Runtime.Runtime<Config> => {
  const mergedConfig = { ...defaultConfig, ...config };
  const evoluLayer = Logger.minimumLogLevel(mergedConfig.minimumLogLevel);

  return evoluLayer.pipe(
    Layer.toRuntime,
    Effect.scoped,
    Effect.runSync,
    Runtime.provideService(Config, mergedConfig),
  );
};

export const createEvoluRunSync: (
  config?: Partial<Config>,
) => <A, E>(effect: Effect.Effect<A, E, Config>) => A = (config) =>
  createEvoluRuntime(config).pipe(Runtime.runSync);
