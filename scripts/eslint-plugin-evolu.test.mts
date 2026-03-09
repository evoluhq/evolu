import { ESLint } from "eslint";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error Test-only JS module import.
import pluginUntyped from "./eslint-plugin-evolu.mjs";

const plugin = pluginUntyped as ESLint.Plugin;

const testFilePath = join(import.meta.dirname, "__lint-test__.js");

const lintText = async (code: string, fix = false) => {
  const eslint = new ESLint({
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        languageOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
        },
        plugins: {
          evolu: plugin,
        },
        rules: {
          "evolu/require-pure-annotation": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintText(code, {
    filePath: testFilePath,
  });

  return result;
};

describe("require-pure-annotation", () => {
  test("reports and fixes top-level exported call expressions", async () => {
    const result = await lintText(
      'export const Value = createValue("x");',
      true,
    );

    expect(result.messages).toHaveLength(0);
    expect(result.output).toBe(
      'export const Value = /*#__PURE__*/ createValue("x");',
    );
  });

  test("reports and fixes nested call expressions inside exported initializers", async () => {
    const code = [
      "export const RunEventData = /*#__PURE__*/ union(",
      '  typed("ChildAdded", { childId: Id }),',
      '  /*#__PURE__*/ typed("ChildRemoved", { childId: Id }),',
      ");",
    ].join("\n");

    const result = await lintText(code, true);

    expect(result.messages).toHaveLength(0);
    expect(result.output).toContain(
      '  /*#__PURE__*/ typed("ChildAdded", { childId: Id }),',
    );
    expect(result.output).toContain(
      '  /*#__PURE__*/ typed("ChildRemoved", { childId: Id }),',
    );
  });

  test("does not report calls inside exported function bodies", async () => {
    const result = await lintText(
      ["export const createThing = () =>", '  outer(inner("x"));'].join("\n"),
    );

    expect(result.messages).toHaveLength(0);
  });

  test("skips immediately invoked function expressions", async () => {
    const result = await lintText(
      "export const value = (() => createValue())();",
    );

    expect(result.messages).toHaveLength(0);
  });

  test("reports nested new expressions", async () => {
    const result = await lintText(
      "export const Registry = /*#__PURE__*/ freeze(new Map());",
      true,
    );

    expect(result.messages).toHaveLength(0);
    expect(result.output).toBe(
      "export const Registry = /*#__PURE__*/ freeze(/*#__PURE__*/ new Map());",
    );
  });
});
