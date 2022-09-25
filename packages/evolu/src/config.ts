import { Config } from "./types.js";

// eslint-disable-next-line functional/no-let
export let config: Config = {
  syncUrl: "http://localhost:4000",
  log: false,
  maxDrift: 60000,
};

export const setConfig = (c: Config): void => {
  config = c;
};
