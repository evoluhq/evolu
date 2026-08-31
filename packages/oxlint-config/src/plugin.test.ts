import { describe, test } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";
import plugin from "./plugin.mjs";

RuleTester.describe = (name, fn) => {
  describe(name, fn);
};
RuleTester.it = (name, fn) => {
  test(name, fn);
};

const ruleTester = new RuleTester({
  languageOptions: {
    globals: {
      Number: "readonly",
      String: "readonly",
    },
    sourceType: "module",
  },
});

ruleTester.run(
  "no-unnecessary-global-this",
  plugin.rules["no-unnecessary-global-this"],
  {
    valid: [
      {
        name: "allows qualification when a runtime name is shadowed",
        code: [
          "const Number = 1;",
          "const value = globalThis.Number;",
          "void Number;",
          "void value;",
        ].join("\n"),
      },
      {
        name: "allows qualification when a script global is shadowed",
        languageOptions: { sourceType: "script" },
        code: ["var Number = 1;", "globalThis.Number;"].join("\n"),
      },
      {
        name: "allows qualification when a type name is shadowed",
        filename: "example.ts",
        code: [
          "interface Worker {}",
          "type NativeWorker = globalThis.Worker;",
          "declare const worker: Worker;",
          "void worker;",
        ].join("\n"),
      },
      {
        name: "allows qualification for an exported API alias",
        code: [
          "const keys = globalThis.Object.keys({});",
          "const _Object = {};",
          "export { _Object as Object };",
          "void keys;",
        ].join("\n"),
      },
      {
        name: "allows optional access to a possibly absent global",
        code: "globalThis.process?.versions;",
      },
      {
        name: "allows an optional globalThis member expression",
        code: "globalThis?.process;",
      },
      {
        name: "allows checking whether a global exists",
        code: [
          'if (typeof globalThis.Buffer !== "undefined") {',
          '  console.log("Buffer is available");',
          "}",
        ].join("\n"),
      },
      {
        name: "allows nullish fallback for a possibly absent global",
        code: "const value = globalThis.reportError ?? console.error;",
      },
      {
        name: "allows nullish comparison for a possibly absent global",
        code: "const hasReportError = globalThis.reportError !== undefined;",
      },
      {
        name: "allows reversed nullish comparison for a possibly absent global",
        code: "const hasReportError = null != globalThis.reportError;",
      },
      {
        name: "allows TypeScript-wrapped nullish comparisons",
        filename: "example.ts",
        code: [
          "const first = globalThis.reportError === (undefined as unknown);",
          "const second = (null as unknown) !== globalThis.reportError;",
          "void first;",
          "void second;",
        ].join("\n"),
      },
      {
        name: "allows boolean existence checks",
        code: [
          "if (globalThis.reportError) {}",
          "while (globalThis.reportError) { break; }",
          "do {} while (globalThis.reportError);",
          "for (; globalThis.reportError; ) { break; }",
          "const value = globalThis.reportError ? 1 : 0;",
          "Boolean(globalThis.reportError);",
          "!globalThis.reportError;",
        ].join("\n"),
      },
      {
        name: "allows writing a global",
        code: "globalThis.sqlite3ApiConfig = {};",
      },
      {
        name: "allows other global write targets",
        code: [
          "globalThis.counter++;",
          "delete globalThis.value;",
          "for (globalThis.value of values) {}",
        ].join("\n"),
      },
      {
        name: "allows global writes nested in assignment patterns",
        filename: "example.ts",
        code: [
          "declare const source: { readonly value: number };",
          "({ value: (globalThis as { target: number }).target } = source);",
          "[(globalThis as { item: number }).item] = [1];",
          "({ value: (globalThis as { fallback: number }).fallback = 0 } = source);",
          "[...(globalThis as { rest: ReadonlyArray<number> }).rest] = [1];",
          "for ({ value: (globalThis as { loop: number }).loop } of [source]) {}",
        ].join("\n"),
      },
      {
        name: "allows a shadowed globalThis object",
        code: ["const globalThis = { Number: 1 };", "globalThis.Number;"].join(
          "\n",
        ),
      },
      {
        name: "allows a non-identifier computed property",
        code: 'globalThis["not-an-identifier"];',
      },
      {
        name: "allows a reserved identifier property",
        code: "globalThis.default;",
      },
      {
        name: "preserves indirect eval semantics",
        code: 'globalThis.eval("value");',
      },
    ],
    invalid: [
      {
        name: "reports and fixes runtime global access",
        code: "const value = globalThis.Number.isFinite(1);",
        output: "const value = Number.isFinite(1);",
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "Number" },
          },
        ],
      },
      {
        name: "reports and fixes TypeScript global type access",
        filename: "example.ts",
        code: "type Scope = globalThis.DedicatedWorkerGlobalScope;",
        output: null,
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "DedicatedWorkerGlobalScope" },
          },
        ],
      },
      {
        name: "reports an unknown global without fixing it",
        filename: "example.ts",
        code: [
          "const value = (globalThis as { maybeApi?: number }).maybeApi;",
          "void value;",
        ].join("\n"),
        output: null,
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "maybeApi" },
          },
        ],
      },
      {
        name: "reports and fixes static computed global access",
        code: 'const value = globalThis["Number"].isFinite(1);',
        output: "const value = Number.isFinite(1);",
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "Number" },
          },
        ],
      },
      {
        name: "reports and fixes static template global access",
        code: "const value = globalThis[`Number`].isFinite(1);",
        output: "const value = Number.isFinite(1);",
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "Number" },
          },
        ],
      },
      {
        name: "reports and fixes access through a TypeScript wrapper",
        filename: "example.ts",
        code: [
          "const value = (globalThis as typeof globalThis).Number;",
          "void value;",
        ].join("\n"),
        output: ["const value = Number;", "void value;"].join("\n"),
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "Number" },
          },
        ],
      },
      {
        name: "reports a direct global call without changing its receiver",
        code: "const value = globalThis.String(1);",
        output: null,
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "String" },
          },
        ],
      },
      {
        name: "reports a wrapped direct global call without changing its receiver",
        filename: "example.ts",
        code: "const value = (globalThis.String as typeof String)(1);",
        output: null,
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "String" },
          },
        ],
      },
      {
        name: "reports a tagged global without changing its receiver",
        code: "globalThis.String.raw`value`;",
        output: "String.raw`value`;",
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "String" },
          },
        ],
      },
      {
        name: "reports a direct tagged global without changing its receiver",
        code: "globalThis.String`value`;",
        output: null,
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "String" },
          },
        ],
      },
      {
        name: "reports commented global access without fixing it",
        code: "globalThis /* native */ .Number;",
        output: null,
        errors: [
          {
            messageId: "unnecessaryGlobalThis",
            data: { name: "Number" },
          },
        ],
      },
    ],
  },
);

ruleTester.run(
  "require-pure-annotation",
  plugin.rules["require-pure-annotation"],
  {
    valid: [
      {
        name: "does not report calls inside exported function bodies",
        code: ["export const createThing = () =>", '  outer(inner("x"));'].join(
          "\n",
        ),
      },
      {
        name: "skips immediately invoked function expressions",
        code: "export const value = (() => createValue())();",
      },
      {
        name: "allows property access inside an annotated factory",
        code: [
          "const createValueParent = () => createValue().parent;",
          "export const Value = /*#__PURE__*/ createValueParent();",
        ].join("\n"),
      },
      {
        name: "allows exported const literals",
        code: "export const value = 1;",
      },
      {
        name: "allows ambient exported const declarations",
        filename: "example.ts",
        code: "export declare const value: number;",
      },
      {
        name: "ignores non-const exports",
        code: "export let value = createValue();",
      },
      {
        name: "allows exported const destructuring without calls",
        code: "export const { value } = source;",
      },
    ],
    invalid: [
      {
        name: "reports and fixes top-level exported call expressions",
        code: 'export const Value = createValue("x");',
        output: 'export const Value = /*#__PURE__*/ createValue("x");',
        errors: [{ messageId: "missingPure", data: { name: "Value" } }],
      },
      {
        name: "reports and fixes nested call expressions inside exported initializers",
        code: [
          "export const RunEventData = /*#__PURE__*/ union(",
          '  typed("ChildAdded", { childId: Id }),',
          '  /*#__PURE__*/ typed("ChildRemoved", { childId: Id }),',
          ");",
        ].join("\n"),
        output: [
          "export const RunEventData = /*#__PURE__*/ union(",
          '  /*#__PURE__*/ typed("ChildAdded", { childId: Id }),',
          '  /*#__PURE__*/ typed("ChildRemoved", { childId: Id }),',
          ");",
        ].join("\n"),
        errors: [{ messageId: "missingPure", data: { name: "RunEventData" } }],
      },
      {
        name: "reports nested new expressions",
        code: "export const Registry = /*#__PURE__*/ freeze(new Map());",
        output:
          "export const Registry = /*#__PURE__*/ freeze(/*#__PURE__*/ new Map());",
        errors: [{ messageId: "missingPure", data: { name: "Registry" } }],
      },
      {
        name: "reports property access on a call result",
        code: "export const Value = /*#__PURE__*/ createValue().parent;",
        output: null,
        errors: [
          {
            messageId: "callResultMemberAccess",
            data: { name: "Value" },
          },
        ],
      },
      {
        name: "reports property access on a constructed result",
        code: "export const Value = /*#__PURE__*/ new Factory().parent;",
        output: null,
        errors: [
          {
            messageId: "callResultMemberAccess",
            data: { name: "Value" },
          },
        ],
      },
    ],
  },
);
