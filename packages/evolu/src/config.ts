import { Config } from "./types.js";

export let config: Config = {
  // For local dev with the monorepo:
  // config.syncUrl = "http://localhost:4000"
  syncUrl: "https://bold-frost-4029.fly.dev",
  log: false,
  maxDrift: 60000,
  reloadUrl: "/",
};

export const setConfig = (c: Config): void => {
  config = c;
};
