import { ESLint } from "eslint";
import { join } from "node:path";
import tseslint from "typescript-eslint";
import { describe, expect, test } from "vitest";
// @ts-expect-error Test-only JS module import.
import pluginUntyped from "./eslint-plugin-evolu.mjs";

const plugin = pluginUntyped as ESLint.Plugin;

const testFilePath = join(import.meta.dirname, "__lint-test__.js");
const typeAwareTestFilePath = join(import.meta.dirname, "__lint-test__.ts");

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

const lintTypeScript = async (code: string) => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            projectService: { allowDefaultProject: ["__lint-test__.ts"] },
            tsconfigRootDir: import.meta.dirname,
          },
        },
        plugins: {
          evolu: plugin,
        },
        rules: {
          "evolu/no-direct-task-call": "error",
        },
      },
    ],
  });

  const [result] = await eslint.lintText(code, {
    filePath: typeAwareTestFilePath,
  });

  return result;
};

const lintWithoutTypeInformation = async (code: string) => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        plugins: {
          evolu: plugin,
        },
        rules: {
          "evolu/no-direct-task-call": "error",
        },
      },
    ],
  });

  return eslint.lintText(code, { filePath: testFilePath });
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

describe("no-direct-task-call", () => {
  test("reports calling an intersection of Task", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run, Task } from "../packages/common/src/Task2.js";',
        "type AppTask = Task<void> & { readonly appTask: true };",
        "declare const run: Run;",
        "declare const task: AppTask;",
        "task(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directTaskCall",
      },
    ]);
  });

  test("reports ordinary functions accepting an alias of Run", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run } from "../packages/common/src/Task2.js";',
        "type AppRun = Run;",
        "declare const run: AppRun;",
        "declare const inspectRun: (run: AppRun) => void;",
        "inspectRun(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directRunArgument",
      },
    ]);
  });

  test("allows calling a Task factory", async () => {
    const result = await lintTypeScript(
      [
        'import type { Task } from "../packages/common/src/Task2.js";',
        "declare const createTask: () => Task<void>;",
        "createTask();",
      ].join("\n"),
    );

    expect(result.messages).toHaveLength(0);
  });

  test("allows generic functions called with Run", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const observe: <T>(value: T) => void;",
        "observe(run);",
      ].join("\n"),
    );

    expect(result.messages).toHaveLength(0);
  });

  test("requires TypeScript type information", async () => {
    await expect(lintWithoutTypeInformation("task(run);")).rejects.toThrow(
      "no-direct-task-call requires TypeScript type information",
    );
  });

  test("reports calling a Task returned by a factory", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run, Task } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const createTask: () => Task<void>;",
        "createTask()(run);",
      ].join("\n"),
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directTaskCall",
      },
    ]);
  });

  test("reports calling a Task member", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run, Task } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const holder: { readonly task: Task<void> };",
        "holder.task(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directTaskCall",
      },
    ]);
  });

  test("reports ordinary functions accepting Run", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const inspectRun: (run: Run) => void;",
        "inspectRun(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directRunArgument",
      },
    ]);
  });

  test("allows starting a Task with Run", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run, Task } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const task: Task<void>;",
        "run(task);",
      ].join("\n"),
    );

    expect(result.messages).toHaveLength(0);
  });

  test("reports calling a NextTask", async () => {
    const result = await lintTypeScript(
      [
        'import type { NextTask, Run } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const task: NextTask<void>;",
        "task(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directTaskCall",
      },
    ]);
  });

  test("reports calling an alias of Task", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run, Task } from "../packages/common/src/Task2.js";',
        "type AppTask = Task<void>;",
        "declare const run: Run;",
        "declare const task: AppTask;",
        "task(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directTaskCall",
      },
    ]);
  });

  test("allows calling an unrelated type named Task", async () => {
    const result = await lintTypeScript(
      [
        "type Task = (value: string) => void;",
        "declare const task: Task;",
        'task("value");',
      ].join("\n"),
    );

    expect(result.messages).toHaveLength(0);
  });

  test("reports calling a Task with a Run", async () => {
    const result = await lintTypeScript(
      [
        'import type { Run, Task } from "../packages/common/src/Task2.js";',
        "declare const run: Run;",
        "declare const task: Task<void>;",
        "task(run);",
      ].join("\n"),
    );

    expect(result.messages).toMatchObject([
      {
        ruleId: "evolu/no-direct-task-call",
        messageId: "directTaskCall",
      },
    ]);
  });
});
