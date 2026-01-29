// @ts-check

/**
 * Custom ESLint rules for Evolu.
 *
 * @module
 */

/** @type {import("eslint").Rule.RuleModule} */
const requirePureAnnotation = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require /*#__PURE__*/ for exported const initialized with function calls",
      recommended: true,
    },
    fixable: "code",
    messages: {
      missingPure:
        "Exported const '{{name}}' is initialized with a function call and needs /*#__PURE__*/ annotation for tree-shaking.",
    },
    schema: [],
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (decl?.type !== "VariableDeclaration" || decl.kind !== "const")
          return;

        for (const declarator of decl.declarations) {
          // Only check direct function calls (not arrow functions, objects, etc.)
          if (declarator.init?.type !== "CallExpression") continue;

          // Skip if it's an IIFE - those are intentionally evaluated
          const callee = declarator.init.callee;
          if (
            callee.type === "ArrowFunctionExpression" ||
            callee.type === "FunctionExpression"
          )
            continue;

          const sourceCode = context.sourceCode;
          const comments = sourceCode.getCommentsBefore(declarator.init);
          const hasPure = comments.some((c) => c.value.includes("#__PURE__"));

          if (!hasPure) {
            const name =
              declarator.id.type === "Identifier" ? declarator.id.name : "?";

            context.report({
              node: declarator.init,
              messageId: "missingPure",
              data: { name },
              fix: (fixer) =>
                fixer.insertTextBefore(declarator.init, "/*#__PURE__*/ "),
            });
          }
        }
      },
    };
  },
};

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: {
    name: "eslint-plugin-evolu",
    version: "1.0.0",
  },
  rules: {
    "require-pure-annotation": requirePureAnnotation,
  },
};

/** @type {Record<string, import("eslint").Linter.Config>} */
export const configs = {
  recommended: {
    plugins: { evolu: plugin },
    rules: {
      "evolu/require-pure-annotation": "error",
    },
  },
};

export default plugin;
