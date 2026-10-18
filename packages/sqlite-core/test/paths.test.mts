import { assertEqual } from "@evolu/common";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "../scripts/paths.mts";

const packageDirectory = join(import.meta.dirname, "..");

describe("defaultBuildDirectory and defaultCacheDirectory", () => {
  it("are the package's directories when their variables are unset or empty", () => {
    for (const env of [{}, { SQLITE_CORE_BUILD: "", SQLITE_CORE_CACHE: "" }]) {
      assertEqual(defaultBuildDirectory(env), join(packageDirectory, "build/"));
      assertEqual(
        defaultCacheDirectory(env),
        join(packageDirectory, "sqlite-cache/"),
      );
    }
  });

  it("resolve a relative value against the working directory and keep an absolute one", () => {
    assertEqual(
      defaultBuildDirectory({ SQLITE_CORE_BUILD: "relative/build" }),
      resolve(process.cwd(), "relative/build"),
    );
    assertEqual(
      defaultCacheDirectory({ SQLITE_CORE_CACHE: "relative/cache" }),
      resolve(process.cwd(), "relative/cache"),
    );
    assertEqual(
      defaultBuildDirectory({ SQLITE_CORE_BUILD: "/absolute/build" }),
      "/absolute/build",
    );
    assertEqual(
      defaultCacheDirectory({ SQLITE_CORE_CACHE: "/absolute/cache" }),
      "/absolute/cache",
    );
  });
});
