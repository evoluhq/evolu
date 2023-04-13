import * as Context from "@effect/data/Context";

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

const defaultConfig: Config = {
  syncUrl: "https://bold-frost-4029.fly.dev",
  maxDrift: 5 * 60 * 1000,
  reloadUrl: "/",
};

export const create = (config?: Partial<Config>): Config => ({
  ...defaultConfig,
  ...config,
});
