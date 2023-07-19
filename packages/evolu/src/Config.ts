import { Context, Layer } from "effect";

export interface Config {
  /**
   * Alternate URL to Evolu sync&backup server.
   */
  syncUrl: string;
  /**
   * Alternate URL to reload browser tabs after `Owner` reset or restore.
   * The default value is `/`.
   */
  reloadUrl: string;
  /**
   * Maximum physical clock drift allowed in ms.
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  maxDrift: number;
}

export const Config = Context.Tag<Config>();

export const makeConfig =
  (config: Config) =>
  (partialConfig?: Partial<Config>): Layer.Layer<never, never, Config> =>
    Layer.succeed(Config, Config.of({ ...config, ...partialConfig }));
