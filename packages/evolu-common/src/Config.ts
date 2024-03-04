import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

export interface Config {
  /** Alternate URL to Evolu sync and backup server. */
  readonly syncUrl: string;

  /**
   * Alternate URL to reload browser tabs after {@link Owner} reset or restore.
   * The default value is `/`.
   */
  readonly reloadUrl: string;

  /**
   * Maximum physical clock drift allowed in ms. The default value is 5 * 60 *
   * 1000 (5 minutes).
   */
  readonly maxDrift: number;

  /**
   * Evolu application name. For now, this is only useful for localhost
   * development, where we want each application to have its own database. The
   * default value is: "Evolu".
   */
  readonly name: string;
}

export const Config = Context.GenericTag<Config>("@services/Config");

export const ConfigLive = (config?: Partial<Config>): Layer.Layer<Config> =>
  Layer.succeed(
    Config,
    Config.of({
      syncUrl: "https://evolu.world",
      maxDrift: 5 * 60 * 1000,
      reloadUrl: "/",
      name: "Evolu",
      ...config,
    }),
  );
