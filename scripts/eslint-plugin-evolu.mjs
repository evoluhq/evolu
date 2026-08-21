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
        "Require /*#__PURE__*/ for call expressions in exported const initializers",
      recommended: true,
    },
    fixable: "code",
    messages: {
      missingPure:
        "Call expression within exported const '{{name}}' needs /*#__PURE__*/ annotation for tree-shaking.",
      callResultMemberAccess:
        "Property access on a call result within exported const '{{name}}' is not made tree-shakable by /*#__PURE__*/. Move the access behind an annotated factory call.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    /** @type {Readonly<Record<string, ReadonlyArray<string>>>} */
    const visitorKeys = sourceCode.visitorKeys;

    /**
     * @param {import("estree").Node | null | undefined} node
     * @returns {boolean}
     */
    const isFunctionBoundary = (node) =>
      node?.type === "ArrowFunctionExpression" ||
      node?.type === "FunctionExpression" ||
      node?.type === "FunctionDeclaration" ||
      node?.type === "MethodDefinition" ||
      node?.type === "PropertyDefinition";

    /**
     * @param {import("estree").Node | null | undefined} node
     * @returns {boolean}
     */
    const isPureCandidate = (node) => {
      if (node == null) return false;
      if (node.type !== "CallExpression" && node.type !== "NewExpression")
        return false;

      if (node.type === "CallExpression") {
        const { callee } = node;

        if (
          callee.type === "ArrowFunctionExpression" ||
          callee.type === "FunctionExpression"
        )
          return false;
      }

      return true;
    };

    /**
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const hasPureAnnotation = (node) =>
      sourceCode
        .getCommentsBefore(node)
        .some((comment) => comment.value.includes("#__PURE__"));

    /**
     * @param {import("estree").Node | null | undefined} node
     * @returns {boolean}
     */
    const isCallResultMemberAccess = (node) =>
      node?.type === "MemberExpression" &&
      (node.object.type === "CallExpression" ||
        node.object.type === "NewExpression");

    /**
     * @param {unknown} value
     * @returns {value is import("estree").Node}
     */
    const isNode = (value) =>
      value != null &&
      typeof value === "object" &&
      "type" in value &&
      typeof value.type === "string";

    /**
     * @param {import("estree").Node | null | undefined} node
     * @param {string} exportName
     * @param {import("estree").Node | null} parent
     * @returns {void}
     */
    const visitNode = (node, exportName, parent = null) => {
      if (node == null || isFunctionBoundary(node)) return;

      if (isCallResultMemberAccess(node)) {
        context.report({
          node,
          messageId: "callResultMemberAccess",
          data: { name: exportName },
        });
      }

      const isMemberAccessObject =
        parent?.type === "MemberExpression" && parent.object === node;

      if (
        isPureCandidate(node) &&
        !isMemberAccessObject &&
        !hasPureAnnotation(node)
      ) {
        context.report({
          node,
          messageId: "missingPure",
          data: { name: exportName },
          fix: (fixer) => fixer.insertTextBefore(node, "/*#__PURE__*/ "),
        });
      }

      const nodeRecord = /** @type {Record<string, unknown>} */ (
        /** @type {unknown} */ (node)
      );

      for (const key of visitorKeys[node.type] ?? []) {
        const child = nodeRecord[key];

        if (Array.isArray(child)) {
          for (const item of child) {
            if (isNode(item)) visitNode(item, exportName, node);
          }
          continue;
        }

        if (isNode(child)) visitNode(child, exportName, node);
      }
    };

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (decl?.type !== "VariableDeclaration" || decl.kind !== "const")
          return;

        for (const declarator of decl.declarations) {
          const exportName =
            declarator.id.type === "Identifier" ? declarator.id.name : "?";

          visitNode(declarator.init, exportName);
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
