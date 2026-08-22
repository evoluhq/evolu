import { RuleTester } from "oxlint/plugins-dev";
import { describe, test } from "vitest";
import plugin from "./plugin.mjs";

RuleTester.describe = (name, fn) => {
  describe(name, fn);
};
RuleTester.it = (name, fn) => {
  test(name, fn);
};

const ruleTester = new RuleTester({
  languageOptions: { sourceType: "module" },
});

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
    ],
  },
);
