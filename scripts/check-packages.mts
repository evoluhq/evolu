import { deepStrictEqual, match, ok } from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  "packages/sqlite-wasm",
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

// A library's lockfile is not published, so a range lets an install that
// resolves it anew, such as adding or updating the library, pick a newer,
// untested version, such as a compromised release. Published packages
// therefore pin external runtime dependencies exactly.
for (const packageDirectory of [...packageDirectories, "apps/relay"]) {
  const {
    name,
    dependencies = {},
    optionalDependencies = {},
  } = JSON.parse(
    await readFile(
      new URL(`${packageDirectory}/package.json`, repositoryDirectory),
      "utf8",
    ),
  ) as {
    readonly name: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
  };
  for (const [dependency, version] of Object.entries({
    ...dependencies,
    ...optionalDependencies,
  })) {
    // pnpm publishes workspace:* as the exact version, but workspace:^ as a range.
    if (version === "workspace:*") continue;
    match(
      version,
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u,
      `${name} must pin ${dependency} to an exact version, not ${version}`,
    );
  }
}

// Packed with its prepack, which checks that the wasm is the pinned one, builds
// the package and copies the wasm into dist.
const sqliteWasmDirectory = "packages/sqlite-wasm";
// Packed with its prepack, which builds the package and writes native/, the C
// apps compile, from the pinned SQLite and the core.
const reactNativeDirectory = "packages/react-native";
// Packed with its prepack, which builds the package, checks every target's
// SQLite addon in native/, which CI builds, and copies them into dist.
const nodejsDirectory = "packages/nodejs";
const nodejsTargets = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
] as const;

// Node.js imports a module from its real path, which macOS's temporary
// directory is not.
const temporaryDirectory = await realpath(
  await mkdtemp(join(tmpdir(), "evolu-packages-")),
);

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
      // A copy left by an earlier pack must not satisfy the check.
      if (packageDirectory === sqliteWasmDirectory)
        await rm(
          new URL(`${sqliteWasmDirectory}/dist/wasm/`, repositoryDirectory),
          {
            recursive: true,
            force: true,
          },
        );
      if (packageDirectory === nodejsDirectory)
        await rm(
          new URL(`${nodejsDirectory}/dist/native/`, repositoryDirectory),
          {
            recursive: true,
            force: true,
          },
        );
      // Nor must a native/ an earlier vendor step wrote.
      if (packageDirectory === reactNativeDirectory)
        await rm(
          new URL(`${reactNativeDirectory}/native/`, repositoryDirectory),
          {
            recursive: true,
            force: true,
          },
        );
      await execFileAsync(
        "pnpm",
        [
          "--dir",
          packageDirectory,
          ...(packageDirectory === sqliteWasmDirectory ||
          packageDirectory === reactNativeDirectory ||
          packageDirectory === nodejsDirectory
            ? []
            : ["--config.ignore-scripts=true"]),
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
      if (packageDirectory === sqliteWasmDirectory) {
        const packedWasm = "package/dist/wasm/sqlite3.wasm";
        ok(
          packedFiles.has(packedWasm),
          `${packageJson.name} packed files must include ${packedWasm}`,
        );
        // The licenses of the code the wasm contains ask for their notices.
        const packedNotices = "package/THIRD_PARTY_NOTICES.md";
        ok(
          packedFiles.has(packedNotices),
          `${packageJson.name} packed files must include ${packedNotices}`,
        );
        const extracted = join(temporaryDirectory, "sqlite-wasm");
        await mkdir(extracted);
        await execFileAsync("tar", ["-xf", tarball, "-C", extracted]);
        ok(
          (await readFile(join(extracted, packedWasm))).equals(
            await readFile(
              new URL(
                `${sqliteWasmDirectory}/wasm/sqlite3.wasm`,
                repositoryDirectory,
              ),
            ),
          ),
          `${packageJson.name} packed ${packedWasm} must be the built wasm`,
        );
        // It has no runtime imports, so it loads from the extracted package.
        const { sqliteWasmUrl } = (await import(
          pathToFileURL(join(extracted, "package/dist/src/WasmUrl.js")).href
        )) as { readonly sqliteWasmUrl: URL };
        deepStrictEqual(
          fileURLToPath(sqliteWasmUrl),
          join(extracted, packedWasm),
          `${packageJson.name} packed sqliteWasmUrl must point to ${packedWasm}`,
        );
      }
      if (packageDirectory === nodejsDirectory) {
        // The licenses of the code the addons contain ask for their notices.
        ok(
          packedFiles.has("package/THIRD_PARTY_NOTICES.md"),
          `${packageJson.name} packed files must include THIRD_PARTY_NOTICES.md`,
        );
        deepStrictEqual(
          [...packedFiles]
            .filter((file) => file.startsWith("package/dist/native/"))
            .toSorted(),
          nodejsTargets.map(
            (target) => `package/dist/native/${target}/evolu.node`,
          ),
          `${packageJson.name} packed dist/native/ must hold the SQLite addon of each target and nothing else`,
        );
        const extracted = join(temporaryDirectory, "nodejs");
        await mkdir(extracted);
        await execFileAsync("tar", ["-xf", tarball, "-C", extracted]);
        for (const target of nodejsTargets)
          ok(
            (
              await readFile(
                join(extracted, `package/dist/native/${target}/evolu.node`),
              )
            ).equals(
              await readFile(
                new URL(
                  `${nodejsDirectory}/native/${target}/evolu.node`,
                  repositoryDirectory,
                ),
              ),
            ),
            `${packageJson.name} packed dist/native/${target}/evolu.node must be the built addon`,
          );
        // The loader imports, at run time, only Node.js's own modules and the
        // row builder beside it, so it loads the running platform's addon from
        // the extracted package.
        const { loadNativeSqlite } = (await import(
          pathToFileURL(join(extracted, "package/dist/src/NativeSqlite.js"))
            .href
        )) as typeof import("../packages/nodejs/src/NativeSqlite.ts");
        loadNativeSqlite({
          rowPrototype: Object.freeze(Object.create(null) as object),
        })
          .openMemory()
          .close();
        ok(
          Object.keys(createRequire(import.meta.url).cache).some((path) =>
            path.startsWith(join(extracted, "package/dist/native/")),
          ),
          `${packageJson.name} packed loader must load its addon from dist/native`,
        );
      }
      if (packageDirectory === reactNativeDirectory) {
        const extracted = join(temporaryDirectory, "react-native");
        await mkdir(extracted);
        await execFileAsync("tar", ["-xf", tarball, "-C", extracted]);
        const packed = join(extracted, "package");
        const packedManifest = await readFile(join(packed, "native.json"));
        const { files } = JSON.parse(packedManifest.toString("utf8")) as {
          readonly files: Readonly<Record<string, { readonly sha256: string }>>;
        };
        const sha256 = (bytes: Buffer) =>
          createHash("sha256").update(bytes).digest("hex");
        const packedUnder = (directory: string) =>
          [...packedFiles]
            .filter((file) => file.startsWith(`package/${directory}/`))
            .map((file) => file.slice("package/".length))
            .toSorted();

        // native/ is the C apps compile, so it must be the tree the packed
        // native.json lists, with the digest the podspec and
        // cpp/CMakeLists.txt require.
        const digest = "native/native.json.sha256";
        deepStrictEqual(
          packedUnder("native"),
          [
            ...Object.keys(files).map((path) => `native/${path}`),
            digest,
          ].toSorted(),
          `${packageJson.name} packed native/ must hold the files its native.json lists and the digest`,
        );
        for (const [path, file] of Object.entries(files))
          deepStrictEqual(
            sha256(await readFile(join(packed, "native", path))),
            file.sha256,
            `${packageJson.name} packed native/${path} must match its native.json`,
          );
        deepStrictEqual(
          await readFile(join(packed, digest), "utf8"),
          `${sha256(packedManifest)}\n`,
          `${packageJson.name} packed ${digest} must hold its native.json's SHA-256`,
        );

        // Every file apps build with, codegen's specs included, and nothing
        // Gradle or the NDK leave in android/.
        for (const file of [
          "THIRD_PARTY_NOTICES.md",
          "EvoluReactNative.podspec",
          "react-native.config.js",
        ])
          ok(
            packedFiles.has(`package/${file}`),
            `${packageJson.name} packed files must include ${file}`,
          );
        const { codegenConfig } = packageJson as unknown as {
          readonly codegenConfig: { readonly jsSrcsDir: string };
        };
        for (const directory of [
          "cpp",
          "ios",
          "android",
          codegenConfig.jsSrcsDir,
        ]) {
          const sources = (
            await readdir(
              new URL(`${packageDirectory}/${directory}/`, repositoryDirectory),
              {
                recursive: true,
                withFileTypes: true,
              },
            )
          )
            .filter((entry) => entry.isFile())
            .map((entry) =>
              relative(
                fileURLToPath(
                  new URL(`${packageDirectory}/`, repositoryDirectory),
                ),
                join(entry.parentPath, entry.name),
              ),
            )
            .filter(
              (file) =>
                !file.startsWith("android/build/") &&
                !file.startsWith("android/.cxx/"),
            )
            .toSorted();
          deepStrictEqual(
            packedUnder(directory),
            sources,
            `${packageJson.name} packed ${directory}/ must hold its sources, without android/build or android/.cxx`,
          );
        }
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
