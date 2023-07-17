import { Config } from "./Types.js";

const defaultConfig: Config = {
  syncUrl: "https://evolu.world",
  maxDrift: 5 * 60 * 1000,
  reloadUrl: "/",
};

export const createConfig = (config?: Partial<Config>): Config => ({
  ...defaultConfig,
  ...config,
});
