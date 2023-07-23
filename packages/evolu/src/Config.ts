import { Context, Layer } from "effect";

export interface Config {
  /**
   * Alternate URL to Evolu sync&backup server.
   */
  readonly syncUrl: string;
  /**
   * Alternate URL to reload browser tabs after `Owner` reset or restore.
   * The default value is `/`.
   */
  readonly reloadUrl: string;
  /**
   * Maximum physical clock drift allowed in ms.
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  readonly maxDrift: number;
}

export const Config = Context.Tag<Config>();

const makeConfig =
  (config: Config) =>
  (partialConfig?: Partial<Config>): Layer.Layer<never, never, Config> =>
    Layer.succeed(Config, Config.of({ ...config, ...partialConfig }));

export const ConfigLive = makeConfig({
  syncUrl: "https://evolu.world",
  maxDrift: 5 * 60 * 1000,
  reloadUrl: "/",
});
