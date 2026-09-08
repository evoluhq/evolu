import { readFileSync } from "node:fs";
import {
  createPrinter,
  createSourceFile,
  isVariableStatement,
  ScriptTarget,
} from "typescript";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("emitted declarations", () => {
  for (const [name, fixture] of [
    ["defaulted properties", "defaults.mts"],
    ["local-first schema fixtures", "local-first.mts"],
    ["literal values, members, errors, and localization", "literals.mts"],
  ])
    it(`preserves ${name}`, () => {
      const compiler = resolve(
        dirname(
          fileURLToPath(import.meta.resolve("@typescript/native/package.json")),
        ),
        "bin/tsc",
      );
      const result = spawnSync(
        process.execPath,
        [
          compiler,
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--exactOptionalPropertyTypes",
          "--skipLibCheck",
          "--target",
          "es2022",
          "--module",
          "nodenext",
          "--types",
          "node",
          resolve(import.meta.dirname, "fixtures", fixture),
        ],
        { encoding: "utf8", timeout: 30000 },
      );

      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    });

  it("keeps literal declarations compact without counting documentation", () => {
    const printer = createPrinter({ removeComments: true });
    for (const [module, maximumBytes] of [
      ["Bytes", 12000],
      ["Time", 7500],
      ["Number", 4000],
    ] as const) {
      const path = resolve(
        import.meta.dirname,
        `../../packages/common/dist/src/${module}.d.ts`,
      );
      const source = createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ScriptTarget.Latest,
        true,
      );
      const bytes = Buffer.byteLength(printer.printFile(source));
      assert.ok(
        bytes <= maximumBytes,
        `${module}.d.ts contains ${bytes} declaration bytes; expected at most ${maximumBytes}. Preserve named Type references instead of expanding them.`,
      );
    }
    const path = resolve(
      import.meta.dirname,
      "../../packages/common/dist/src/Type.d.ts",
    );
    const source = createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ScriptTarget.Latest,
      true,
    );
    const names = new Set([
      "Digit1To23",
      "Digit1To51",
      "Digit1To59",
      "Digit1To99",
    ]);
    for (const statement of source.statements) {
      if (!isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(source);
        if (!names.has(name)) continue;
        assert.ok(
          Buffer.byteLength(declaration.getText(source)) < 1000,
          `${name} must preserve shared digit references.`,
        );
        names.delete(name);
      }
    }
    assert.equal(
      names.size,
      0,
      "Every digit-range declaration must be checked.",
    );
  });
});
