import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertInstanceOf,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { checkWasmFile, readPinnedWasm } from "./check-wasm.mts";

describe("checkWasmFile", () => {
  it("finds a missing file", (t) => {
    const path = join(setupDirectory(t), "sqlite3.wasm");

    assertEqual(checkWasmFile(path, sha256(wasm)), { type: "Missing" });
  });

  it("finds the pinned wasm and returns its bytes", (t) => {
    const path = setupWasm(t, wasm);

    const check = checkWasmFile(path, sha256(wasm));

    assert(check.type === "Pinned", "Expected the pinned wasm.");
    assertEqualBytes(check.bytes, wasm);
  });

  it("finds a file that differs from the pin and returns its sha256", (t) => {
    const path = setupWasm(t, other);

    assertEqual(checkWasmFile(path, sha256(wasm)), {
      type: "Differs",
      sha256: sha256(other),
    });
  });
});

describe("readPinnedWasm", () => {
  it("returns the bytes of the pinned wasm", (t) => {
    const path = setupWasm(t, wasm);

    assertEqualBytes(readPinnedWasm(path, sha256(wasm)), wasm);
  });

  it("throws for a missing file, saying how to get the pinned wasm", (t) => {
    const path = join(setupDirectory(t), "sqlite3.wasm");

    assertThrowsWithMessage(
      () => readPinnedWasm(path, sha256(wasm)),
      `${path} is missing. ${howToGetWasm}`,
    );
  });

  it("throws for a file that differs from the pin, saying how to get the pinned wasm", (t) => {
    const path = setupWasm(t, other);

    assertThrowsWithMessage(
      () => readPinnedWasm(path, sha256(wasm)),
      `${path} has sha256 ${sha256(other)}, not the pinned ${sha256(wasm)}. ${howToGetWasm}`,
    );
  });
});

describe("check-wasm.mts CLI", () => {
  it("runs before the dev and build scripts of apps/web", () => {
    const { scripts } = readJson("apps/web/package.json");
    const check = "node ../../packages/sqlite-wasm/scripts/check-wasm.mts";

    assertEqual(
      [scripts.dev, scripts.build].filter(
        (script) => !script.startsWith(`${check} && `),
      ),
      [],
    );
  });

  it("runs before the e2e web servers build or start the playground", () => {
    const command =
      /\n {4}command:\s+["']node packages\/sqlite-wasm\/scripts\/check-wasm\.mts && /u;

    assertEqual(
      [
        "test/e2e/playwright.config.mts",
        "test/e2e/playwright.dev.config.mts",
      ].filter((config) => !command.test(readText(config))),
      [],
    );
  });

  it("checks a wasm the Checks workflow restores", () => {
    const checksStep = readWorkflowSteps("checks.yaml").find((step) =>
      step.startsWith("name: Verify restored wasm\n"),
    );

    assertTrue(
      checksStep?.includes(
        "\n          node packages/sqlite-wasm/scripts/check-wasm.mts\n",
      ) === true,
    );
  });

  it("runs before the prepack builds the package and copies the wasm into it", () => {
    const { scripts } = readJson("packages/sqlite-wasm/package.json");

    assertEqual(
      scripts.prepack,
      `node scripts/check-wasm.mts && npm run build && node -e "require('node:fs').cpSync('wasm/sqlite3.wasm', 'dist/wasm/sqlite3.wasm')"`,
    );
  });
});

const wasm = new TextEncoder().encode("pinned wasm");
const other = new TextEncoder().encode("other wasm");

const howToGetWasm =
  "Download the pinned wasm with pnpm sqlite-wasm:download in the repository root, or build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const repositoryRoot = new URL("../../../", import.meta.url);

const readText = (path: string): string =>
  readFileSync(new URL(path, repositoryRoot), "utf8");

const readJson = (
  path: string,
): { readonly scripts: Readonly<Record<string, string>> } =>
  JSON.parse(readText(path)) as {
    readonly scripts: Readonly<Record<string, string>>;
  };

/** The steps of a workflow's jobs, each from its `name:` line. */
const readWorkflowSteps = (file: string): ReadonlyArray<string> =>
  readText(`.github/workflows/${file}`).split("\n      - ");

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-check-wasm-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

const setupWasm = (t: TestContext, bytes: Uint8Array): string => {
  const path = join(setupDirectory(t), "sqlite3.wasm");
  writeFileSync(path, bytes);
  return path;
};

const assertThrowsWithMessage = (run: () => unknown, message: string): void => {
  assertThrows(run, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });
};
