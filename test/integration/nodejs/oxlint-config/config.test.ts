import { spawnSync } from "node:child_process";
import nodeAssert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = join(
  import.meta.dirname,
  "../../../../packages/oxlint-config",
);
const oxlintDirectory = dirname(
  fileURLToPath(import.meta.resolve("oxlint/package.json")),
);
const tsgolintBinDirectory = join(
  dirname(
    dirname(fileURLToPath(import.meta.resolve("oxlint-tsgolint/package.json"))),
  ),
  ".bin",
);

const nodeTestTypes = [
  'declare module "node:test" {',
  "  export const describe: (name: string, run: () => void) => Promise<void>;",
  "  export const it: (name: string, run: () => void) => Promise<void>;",
  "}",
].join("\n");

const lintFiles = (filesByName: Readonly<Record<string, string>>) => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "evolu-oxlint-config-"));

  try {
    for (const [name, source] of Object.entries(filesByName)) {
      writeFileSync(join(fixtureDirectory, name), source);
    }

    return spawnSync(
      join(oxlintDirectory, "bin", "oxlint"),
      ["--config", join(packageDirectory, "config.jsonc"), "."],
      {
        cwd: fixtureDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${tsgolintBinDirectory}${delimiter}${process.env.PATH ?? ""}`,
        },
      },
    );
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
};

test("allows dependency cycles made exclusively of import type declarations", () => {
  const result = lintFiles({
    "a.ts": [
      'import type { B } from "./b.ts";',
      "export interface A { readonly b: B }",
    ].join("\n"),
    "b.ts": [
      'import type { A } from "./a.ts";',
      "export interface B { readonly a: A }",
    ].join("\n"),
  });

  nodeAssert.equal(result.status, 0);
});

test("allows dependency cycles made exclusively of inline type imports", () => {
  const result = lintFiles({
    "a.ts": [
      'import { type B } from "./b.ts";',
      "export interface A { readonly b: B }",
    ].join("\n"),
    "b.ts": [
      'import { type A } from "./a.ts";',
      "export interface B { readonly a: A }",
    ].join("\n"),
  });

  nodeAssert.equal(result.status, 0);
});

test("rejects runtime dependency cycles", () => {
  const result = lintFiles({
    "a.ts": ['import { b } from "./b.ts";', "export const a = b;"].join("\n"),
    "b.ts": ['import { a } from "./a.ts";', "export const b = a;"].join("\n"),
  });

  nodeAssert.equal(result.status, 1);
  nodeAssert.match(result.stdout, /import\(no-cycle\)/u);
});

test("allows Node.js test registration promises", () => {
  const result = lintFiles({
    "node-test.d.ts": nodeTestTypes,
    "example.test.ts": [
      'import { describe, it } from "node:test";',
      'describe("example", () => {',
      '  it("works", () => undefined);',
      "});",
    ].join("\n"),
  });

  nodeAssert.equal(result.status, 0, result.stdout || result.stderr);
});

test("rejects other floating promises in Node.js tests", () => {
  const result = lintFiles({
    "node-test.d.ts": nodeTestTypes,
    "example.test.ts": [
      'import { describe } from "node:test";',
      "const run = async (): Promise<void> => undefined;",
      'describe("example", () => undefined);',
      "run();",
    ].join("\n"),
  });

  nodeAssert.equal(result.status, 1);
  nodeAssert.match(result.stdout, /typescript\(no-floating-promises\)/u);
});

test("temporarily allows unnecessary globalThis qualification", () => {
  const result = lintFiles({
    "example.ts": "export const value = globalThis.Number;",
  });

  nodeAssert.equal(result.status, 0, result.stdout || result.stderr);
});
