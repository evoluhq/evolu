import { deepStrictEqual, match, ok } from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const packageDirectories = [
  "packages/common",
  "packages/nodejs",
  "packages/react",
  "packages/react-native",
  "packages/react-web",
  "packages/svelte",
  "packages/vitest",
  "packages/vue",
  "packages/web",
] as const;

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

const getTargets = (value: Json): ReadonlyArray<string> => {
  if (typeof value === "string") return [value];
  if (value == null || typeof value !== "object") return [];
  if (value instanceof Array) return value.flatMap(getTargets);
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
      new RegExp(`^\\./${expectedDirectory}/`),
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
      new RegExp(`^\\./${expectedDirectory}/`),
      `${packageName} workspace ${condition ?? "export"} target ${value} must point into ${expectedDirectory}`,
    );
    return;
  }
  if (value == null || typeof value !== "object") return;
  if (value instanceof Array) {
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
        match(packageJson.types, /^\.\/dist\//);
        match(packageJson.publishConfig.types ?? "", /^\.\/dist\//);
        deepStrictEqual(
          packageJson.types,
          packageJson.publishConfig.types,
          `${packageJson.name} workspace and published types must match`,
        );
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
    }),
  );
} finally {
  await rm(temporaryDirectory, { recursive: true });
}

// eslint-disable-next-line no-console -- Report successful CLI completion.
console.log(
  "Workspace source runtime exports, declaration types, and packed dist exports are valid.",
);
