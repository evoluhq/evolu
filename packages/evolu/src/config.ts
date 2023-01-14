import { Config } from "./types.js";

export let config: Config = {
  syncUrl: "https://bold-frost-4029.fly.dev",
  log: false,
  maxDrift: 60000,
  reloadUrl: "/",
};

export const setConfig = (c: Config): void => {
  config = c;
};
