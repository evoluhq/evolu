// @ts-check

/**
 * Custom Oxlint rules for Evolu.
 *
 * @module
 */

/**
 * Adapted for Evolu from eslint-plugin-unicorn's no-unnecessary-global-this
 * rule, copyright Sindre Sorhus and contributors, licensed under MIT.
 * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/rules/no-unnecessary-global-this.js
 *
 * @type {import("eslint").Rule.RuleModule}
 */
const noUnnecessaryGlobalThis = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow globalThis qualification when a global name does not conflict with a local API",
      recommended: true,
    },
    fixable: "code",
    messages: {
      unnecessaryGlobalThis:
        "Use '{{name}}' instead of 'globalThis.{{name}}' because '{{name}}' does not conflict with a local API.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    /** @type {Readonly<Record<string, ReadonlyArray<string>>>} */
    const visitorKeys = sourceCode.visitorKeys;

    const transparentExpressionTypes = new Set([
      "ChainExpression",
      "TSAsExpression",
      "TSInstantiationExpression",
      "TSNonNullExpression",
      "TSSatisfiesExpression",
      "TSTypeAssertion",
    ]);

    const reservedIdentifiers = new Set([
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "enum",
      "export",
      "extends",
      "false",
      "finally",
      "for",
      "function",
      "if",
      "implements",
      "import",
      "in",
      "instanceof",
      "interface",
      "let",
      "new",
      "null",
      "package",
      "private",
      "protected",
      "public",
      "return",
      "static",
      "super",
      "switch",
      "this",
      "throw",
      "true",
      "try",
      "typeof",
      "var",
      "void",
      "while",
      "with",
      "yield",
    ]);
    const identifierPattern =
      /^[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*$/u;

    /** @type {Set<string>} */
    const exportedApiNames = new Set();

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
     * @param {import("estree").Node} node
     * @returns {import("estree").Node | null}
     */
    const getParent = (node) => {
      const nodeRecord = /** @type {Record<string, unknown>} */ (
        /** @type {unknown} */ (node)
      );
      return /** @type {import("estree").Node | null} */ (nodeRecord.parent);
    };

    /**
     * @param {import("estree").Node} node
     * @returns {import("eslint").Scope.Scope | null}
     */
    const getScope = (node) => sourceCode.getScope(node);

    /**
     * @param {import("estree").Node} node
     * @param {string} name
     * @returns {boolean}
     */
    const hasLocalBinding = (node, name) => {
      for (let scope = getScope(node); scope != null; scope = scope.upper) {
        const variable = scope.set.get(name);
        if (variable == null) continue;

        // Oxlint exposes built-ins in the global scope without definitions.
        // Those are the globals whose qualification this rule can remove.
        if (scope.type !== "global" || variable.defs.length > 0) return true;
      }

      return false;
    };

    /**
     * @param {import("estree").Node} node
     * @param {string} name
     * @returns {boolean}
     */
    const isActiveGlobal = (node, name) => {
      for (let scope = getScope(node); scope != null; scope = scope.upper) {
        const variable = scope.set.get(name);
        if (variable == null) continue;

        return variable.scope.type === "global" && variable.defs.length === 0;
      }

      return false;
    };

    /**
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const isUnshadowedGlobalThis = (node) =>
      !hasLocalBinding(node, "globalThis");

    /**
     * @param {import("estree").Node} node
     * @returns {import("estree").Node}
     */
    const skipTransparentParents = (node) => {
      let current = node;

      while (true) {
        const parent = getParent(current);
        if (parent == null || !transparentExpressionTypes.has(parent.type))
          break;
        current = parent;
      }

      return current;
    };

    /**
     * @param {import("estree").Node} node
     * @returns {import("estree").Node}
     */
    const unwrapTransparentExpression = (node) => {
      let current = node;

      while (transparentExpressionTypes.has(current.type)) {
        const currentRecord = /** @type {Record<string, unknown>} */ (
          /** @type {unknown} */ (current)
        );
        current = /** @type {import("estree").Node} */ (
          currentRecord.expression
        );
      }

      return current;
    };

    /**
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const isOptionalAccess = (node) => {
      const nodeRecord = /** @type {Record<string, unknown>} */ (
        /** @type {unknown} */ (node)
      );
      if (nodeRecord.optional === true) return true;

      const current = skipTransparentParents(node);
      const parent = /** @type {import("estree").Node} */ (getParent(current));

      const parentRecord = /** @type {Record<string, unknown>} */ (
        /** @type {unknown} */ (parent)
      );
      return (
        parentRecord.optional === true &&
        ((parent.type === "MemberExpression" && parent.object === current) ||
          (parent.type === "CallExpression" && parent.callee === current))
      );
    };

    /**
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const isExistenceCheck = (node) => {
      const current = skipTransparentParents(node);
      const parent = getParent(current);

      if (
        parent?.type === "LogicalExpression" ||
        (parent?.type === "UnaryExpression" &&
          (parent.operator === "!" || parent.operator === "typeof")) ||
        (parent?.type === "IfStatement" && parent.test === current) ||
        (parent?.type === "WhileStatement" && parent.test === current) ||
        (parent?.type === "DoWhileStatement" && parent.test === current) ||
        (parent?.type === "ForStatement" && parent.test === current) ||
        (parent?.type === "ConditionalExpression" && parent.test === current) ||
        (parent?.type === "CallExpression" &&
          parent.arguments[0] === current &&
          parent.callee.type === "Identifier" &&
          parent.callee.name === "Boolean")
      ) {
        return true;
      }

      if (
        parent?.type !== "BinaryExpression" ||
        !["==", "!=", "===", "!=="].includes(parent.operator)
      ) {
        return false;
      }

      const other = unwrapTransparentExpression(
        parent.left === current ? parent.right : parent.left,
      );
      return (
        (other.type === "Literal" && other.value === null) ||
        (other.type === "Identifier" && other.name === "undefined")
      );
    };

    /**
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const isWritten = (node) => {
      let current = skipTransparentParents(node);

      while (true) {
        const parent = getParent(current);
        if (
          (parent?.type === "MemberExpression" && parent.object === current) ||
          (parent?.type === "Property" && parent.value === current) ||
          (parent?.type === "AssignmentPattern" && parent.left === current) ||
          (parent?.type === "RestElement" && parent.argument === current) ||
          (parent?.type === "ArrayPattern" &&
            parent.elements.includes(current)) ||
          (parent?.type === "ObjectPattern" &&
            parent.properties.includes(current))
        ) {
          current = skipTransparentParents(parent);
          continue;
        }

        break;
      }

      const parent = getParent(current);
      return (
        (parent?.type === "AssignmentExpression" && parent.left === current) ||
        (parent?.type === "UpdateExpression" && parent.argument === current) ||
        (parent?.type === "UnaryExpression" &&
          parent.operator === "delete" &&
          parent.argument === current) ||
        ((parent?.type === "ForInStatement" ||
          parent?.type === "ForOfStatement") &&
          parent.left === current)
      );
    };

    /**
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const canFix = (node) => {
      const current = skipTransparentParents(node);
      const parent = getParent(current);

      if (
        (parent?.type === "CallExpression" && parent.callee === current) ||
        (parent?.type === "TaggedTemplateExpression" && parent.tag === current)
      ) {
        return false;
      }

      return sourceCode.getCommentsInside(node).length === 0;
    };

    /**
     * @param {import("estree").Node} node
     * @param {string} name
     * @returns {void}
     */
    const checkGlobalThisAccess = (node, name) => {
      if (
        !identifierPattern.test(name) ||
        reservedIdentifiers.has(name) ||
        !isUnshadowedGlobalThis(node) ||
        hasLocalBinding(node, name) ||
        exportedApiNames.has(name) ||
        isOptionalAccess(node) ||
        isExistenceCheck(node) ||
        isWritten(node)
      ) {
        return;
      }

      // Removing globalThis would turn an indirect eval call into direct eval.
      const current = skipTransparentParents(node);
      const parent = getParent(current);
      if (
        name === "eval" &&
        parent?.type === "CallExpression" &&
        parent.callee === current
      ) {
        return;
      }

      context.report({
        node,
        messageId: "unnecessaryGlobalThis",
        data: { name },
        fix:
          isActiveGlobal(node, name) && canFix(node)
            ? (fixer) => fixer.replaceText(node, name)
            : undefined,
      });
    };

    /**
     * @param {import("estree").Node} node
     * @returns {void}
     */
    const visitNode = (node) => {
      if (node.type === "MemberExpression") {
        const object = unwrapTransparentExpression(node.object);
        let name;

        if (
          object.type === "Identifier" &&
          object.name === "globalThis" &&
          !node.computed &&
          node.property.type === "Identifier"
        ) {
          name = node.property.name;
        } else if (
          object.type === "Identifier" &&
          object.name === "globalThis" &&
          node.computed &&
          node.property.type === "Literal" &&
          typeof node.property.value === "string"
        ) {
          name = node.property.value;
        } else if (
          object.type === "Identifier" &&
          object.name === "globalThis" &&
          node.computed &&
          node.property.type === "TemplateLiteral" &&
          node.property.expressions.length === 0
        ) {
          name = node.property.quasis[0]?.value.cooked;
        }

        if (typeof name === "string") checkGlobalThisAccess(node, name);
      } else if (node.type === "TSQualifiedName") {
        const nodeRecord = /** @type {Record<string, unknown>} */ (
          /** @type {unknown} */ (node)
        );
        const left = nodeRecord.left;
        const right = nodeRecord.right;

        if (
          isNode(left) &&
          left.type === "Identifier" &&
          left.name === "globalThis" &&
          isNode(right) &&
          right.type === "Identifier"
        ) {
          checkGlobalThisAccess(node, right.name);
        }
      }

      const nodeRecord = /** @type {Record<string, unknown>} */ (
        /** @type {unknown} */ (node)
      );

      const keys = visitorKeys[node.type];
      for (const key of keys) {
        const child = nodeRecord[key];

        if (Array.isArray(child)) {
          for (const item of child) {
            if (isNode(item)) visitNode(item);
          }
          continue;
        }

        if (isNode(child)) visitNode(child);
      }
    };

    return {
      Program(node) {
        for (const statement of node.body) {
          if (statement.type !== "ExportNamedDeclaration") continue;

          for (const specifier of statement.specifiers) {
            if (specifier.exported.type === "Identifier") {
              exportedApiNames.add(specifier.exported.name);
            }
          }
        }

        visitNode(node);
      },
    };
  },
};

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
     * @param {import("estree").Node} node
     * @returns {boolean}
     */
    const isPureCandidate = (node) => {
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

      const keys = visitorKeys[node.type];
      for (const key of keys) {
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
    name: "@evolu/oxlint-config",
  },
  rules: {
    "no-unnecessary-global-this": noUnnecessaryGlobalThis,
    "require-pure-annotation": requirePureAnnotation,
  },
};

export default plugin;
