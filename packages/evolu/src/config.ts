import { Config } from "./types.js";

// eslint-disable-next-line prefer-const
export let config: Config = {
  syncUrl: "https://bold-frost-4029.fly.dev",
  log: false,
  maxDrift: 60000,
  reloadUrl: "/",
};
