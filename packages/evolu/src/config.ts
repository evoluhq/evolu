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
   * The default value is 60000 (1 minute).
   */
  maxDrift: number;
}

export interface ConfigEnv {
  readonly config: Config;
}

const defaultConfig: Config = {
  syncUrl: "https://bold-frost-4029.fly.dev",
  maxDrift: 60000,
  reloadUrl: "/",
};

export const createConfig = (config?: Partial<Config>): Config => ({
  ...defaultConfig,
  ...config,
});
