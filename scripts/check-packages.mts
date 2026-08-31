import { deepStrictEqual, match, ok } from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// oxlint-disable-next-line typescript/strict-void-return -- Node's callback-based execFile returns a ChildProcess that promisify intentionally ignores.
const execFileAsync = promisify(execFile);

const packageDirectories = [
  "packages/common",
  "packages/nodejs",
  "packages/oxlint-config",
  "packages/react",
  "packages/react-native",
  "packages/react-web",
  "packages/svelte",
  "packages/typescript-config",
  "packages/vitest",
  "packages/vue",
  "packages/web",
] as const;

const staticPackageDirectories: ReadonlySet<string> = new Set([
  "packages/oxlint-config",
  "packages/typescript-config",
]);

type Json =
  | boolean
  | null
  | number
  | string
  | ReadonlyArray<Json>
  | { readonly [key: string]: Json };

interface PackageJson {
  readonly name: string;
  readonly types?: string;
  readonly exports: Json;
  readonly publishConfig: {
    readonly types?: string;
    readonly exports: Json;
  };
}

const isJsonArray = (value: Json): value is ReadonlyArray<Json> =>
  Array.isArray(value);

const getTargets = (value: Json): ReadonlyArray<string> => {
  if (typeof value === "string") return [value];
  if (value == null || typeof value !== "object") return [];
  if (isJsonArray(value)) return value.flatMap(getTargets);
  return Object.values(value).flatMap(getTargets);
};

const assertTargets = (
  packageName: string,
  kind: "published" | "workspace",
  value: Json,
  expectedDirectory: "dist" | "src",
): void => {
  const targets = getTargets(value);
  ok(targets.length > 0, `${packageName} has no ${kind} export targets`);
  for (const target of targets) {
    match(
      target,
      new RegExp(`^\\./${expectedDirectory}/`, "u"),
      `${packageName} ${kind} target ${target} must point into ${expectedDirectory}`,
    );
  }
};

const assertWorkspaceTargets = (
  packageName: string,
  value: Json,
  condition?: string,
): void => {
  if (typeof value === "string") {
    const expectedDirectory = condition === "types" ? "dist" : "src";
    match(
      value,
      new RegExp(`^\\./${expectedDirectory}/`, "u"),
      `${packageName} workspace ${condition ?? "export"} target ${value} must point into ${expectedDirectory}`,
    );
    return;
  }
  if (value == null || typeof value !== "object") return;
  if (isJsonArray(value)) {
    for (const item of value)
      assertWorkspaceTargets(packageName, item, condition);
    return;
  }
  for (const [key, target] of Object.entries(value)) {
    assertWorkspaceTargets(packageName, target, key);
  }
};

const repositoryDirectory = new URL("../", import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "evolu-packages-"));

try {
  await Promise.all(
    packageDirectories.map(async (packageDirectory) => {
      const directory = new URL(`${packageDirectory}/`, repositoryDirectory);
      const packageJson = JSON.parse(
        await readFile(new URL("package.json", directory), "utf8"),
      ) as PackageJson;

      if (staticPackageDirectories.has(packageDirectory)) {
        if (packageDirectory === "packages/typescript-config") {
          ok(
            !isJsonArray(packageJson.exports) &&
              typeof packageJson.exports === "object" &&
              packageJson.exports != null,
            `${packageJson.name} workspace exports must be an object`,
          );
          const { "./base.json": baseExport, ...publishedExports } =
            packageJson.exports;
          deepStrictEqual(
            baseExport,
            "./base.json",
            `${packageJson.name} must expose its internal base configuration in the workspace`,
          );
          deepStrictEqual(
            publishedExports,
            packageJson.publishConfig.exports,
            `${packageJson.name} published exports must omit its internal base configuration`,
          );
        } else {
          deepStrictEqual(
            packageJson.exports,
            packageJson.publishConfig.exports,
            `${packageJson.name} static workspace and published exports must match`,
          );
        }
        for (const target of getTargets(packageJson.exports)) {
          match(target, /^\.\/[^/]/u);
        }
      } else {
        assertWorkspaceTargets(packageJson.name, packageJson.exports);
        ok(
          getTargets(packageJson.exports).some((target) =>
            target.startsWith("./src/"),
          ),
          `${packageJson.name} has no workspace source runtime export`,
        );
        assertTargets(
          packageJson.name,
          "published",
          packageJson.publishConfig.exports,
          "dist",
        );

        if (packageJson.types != null) {
          match(packageJson.types, /^\.\/dist\//u);
          match(packageJson.publishConfig.types ?? "", /^\.\/dist\//u);
          deepStrictEqual(
            packageJson.types,
            packageJson.publishConfig.types,
            `${packageJson.name} workspace and published types must match`,
          );
        }
      }
      const tarball = join(
        temporaryDirectory,
        `${packageJson.name.replace("@", "").replace("/", "-")}.tgz`,
      );
      await execFileAsync(
        "pnpm",
        [
          "--dir",
          packageDirectory,
          "--config.ignore-scripts=true",
          "pack",
          "--out",
          tarball,
        ],
        { cwd: repositoryDirectory },
      );
      const { stdout } = await execFileAsync(
        "tar",
        ["-xOf", tarball, "package/package.json"],
        { cwd: repositoryDirectory },
      );
      const packedPackageJson = JSON.parse(stdout) as PackageJson;
      const { stdout: archiveListing } = await execFileAsync(
        "tar",
        ["-tf", tarball],
        { cwd: repositoryDirectory },
      );
      const packedFiles = new Set(archiveListing.trim().split("\n"));

      deepStrictEqual(
        packedPackageJson.exports,
        packageJson.publishConfig.exports,
        `${packageJson.name} packed exports do not match publishConfig.exports`,
      );
      if (packageJson.publishConfig.types != null) {
        deepStrictEqual(
          packedPackageJson.types,
          packageJson.publishConfig.types,
        );
      }
      for (const target of getTargets(packedPackageJson.exports)) {
        ok(
          packedFiles.has(`package/${target.slice(2)}`),
          `${packageJson.name} packed export target ${target} is missing`,
        );
      }
      if (packageDirectory === "packages/typescript-config") {
        ok(
          packedFiles.has("package/base.json"),
          `${packageJson.name} packed files must include its internal base configuration`,
        );
      }
    }),
  );
} finally {
  await rm(temporaryDirectory, { recursive: true });
}

// oxlint-disable-next-line eslint/no-console -- Report successful CLI completion.
console.log(
  "Workspace source and static exports, declaration types, and packed packages are valid.",
);
