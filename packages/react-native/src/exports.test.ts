import { assertEqual } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** What Node.js resolves the specifier to under `conditions`, or its error code. */
const resolve = (specifier: string, conditions: ReadonlyArray<string> = []) => {
  const resolved = spawnSync(
    process.execPath,
    [
      ...conditions.map((condition) => `--conditions=${condition}`),
      "--input-type=module",
      "-e",
      `try { console.log(import.meta.resolve(${JSON.stringify(specifier)})); } catch (error) { console.log(error.code); }`,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  return resolved.stdout.trim();
};

test("the /identicon subpath is identicon.ts, so the API reference names its module after the import path", () => {
  assertEqual(
    import.meta.resolve("@evolu/react-native/identicon"),
    new URL("identicon.ts", import.meta.url).href,
  );
});

test("a web build gets web.ts's error from the polyfills too, which an app imports first", () => {
  assertEqual(
    resolve("@evolu/react-native/polyfills", ["browser"]),
    new URL("web.ts", import.meta.url).href,
  );
});

test("the main entry is web.ts in a web build and index.ts in React Native", () => {
  assertEqual(
    [
      resolve("@evolu/react-native", ["browser"]),
      resolve("@evolu/react-native", ["react-native"]),
    ],
    [
      new URL("web.ts", import.meta.url).href,
      new URL("index.ts", import.meta.url).href,
    ],
  );
});

// Metro and other resolvers may pass both conditions, and the first that an
// entry lists wins.
test("every entry of the workspace exports is React Native's under react-native and browser, and the published exports are the same, built", () => {
  type Exports = Record<string, Record<string, string>>;
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    readonly exports: Exports;
    readonly publishConfig: { readonly exports: Exports };
  };
  const toPublished = (target: string) =>
    target.replace(/^\.\/src\/(.*)\.ts$/u, "./dist/src/$1.js");

  assertEqual(
    Object.fromEntries(
      Object.entries(packageJson.exports).map(([entry, conditions]) => [
        entry,
        Object.entries(conditions).find(([condition]) =>
          ["react-native", "browser", "default"].includes(condition),
        )?.[1],
      ]),
    ),
    {
      ".": "./src/index.ts",
      "./identicon": "./src/identicon.ts",
      "./polyfills": "./src/Polyfills.ts",
    },
  );
  // Arrays, so the comparison proves the order of entries and conditions too.
  assertEqual(
    Object.entries(packageJson.exports).map(([entry, conditions]) => [
      entry,
      Object.entries(conditions).map(([condition, target]) => [
        condition,
        toPublished(target),
      ]),
    ]),
    Object.entries(packageJson.publishConfig.exports).map(
      ([entry, conditions]) => [entry, Object.entries(conditions)],
    ),
  );
});

test("the removed /expo-sqlite subpath isn't exported", () => {
  assertEqual(
    resolve("@evolu/react-native/expo-sqlite"),
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
});
