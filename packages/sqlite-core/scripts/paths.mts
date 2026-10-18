import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where host builds and their work directories go: `SQLITE_CORE_BUILD` when set
 * and not empty, otherwise `build` in this package (gitignored).
 */
export const defaultBuildDirectory = (env: NodeJS.ProcessEnv): string => {
  const { SQLITE_CORE_BUILD: build } = env;
  return build == null || build === ""
    ? fileURLToPath(new URL("../build/", import.meta.url))
    : resolve(build);
};

/**
 * Where the SQLite source and the amalgamation generated from it are kept:
 * `SQLITE_CORE_CACHE` when set and not empty, otherwise `sqlite-cache` in this
 * package (gitignored).
 */
export const defaultCacheDirectory = (env: NodeJS.ProcessEnv): string => {
  const { SQLITE_CORE_CACHE: cache } = env;
  // An empty value counts as unset; resolve("") would be the working directory.
  return cache == null || cache === ""
    ? fileURLToPath(new URL("../sqlite-cache/", import.meta.url))
    : resolve(cache);
};
