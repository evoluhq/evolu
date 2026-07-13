// @ts-check

import ts from "typescript";

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
     * @returns {void}
     */
    const visitNode = (node, exportName) => {
      if (node == null || isFunctionBoundary(node)) return;

      if (isPureCandidate(node) && !hasPureAnnotation(node)) {
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
            if (isNode(item)) visitNode(item, exportName);
          }
          continue;
        }

        if (isNode(child)) visitNode(child, exportName);
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

/** @type {import("eslint").Rule.RuleModule} */
const noDirectTaskCall = {
  meta: {
    type: "problem",
    docs: {
      description: "Require Tasks to be started with run(task)",
      recommended: true,
    },
    messages: {
      directTaskCall:
        "Do not call a Task directly. Use run(task) to preserve structured concurrency.",
      directRunArgument:
        "Do not pass Run to a function. Define a Task and start it with run(task).",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const { esTreeNodeToTSNodeMap, program } = sourceCode.parserServices;

    if (!esTreeNodeToTSNodeMap || !program)
      throw new Error(
        "no-direct-task-call requires TypeScript type information",
      );

    const checker = /** @type {import("typescript").TypeChecker} */ (
      program.getTypeChecker()
    );

    /**
     * @param {import("typescript").Symbol | undefined} symbol
     * @returns {import("typescript").Symbol | undefined}
     */
    const resolveSymbol = (symbol) =>
      symbol && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;

    /**
     * @param {import("typescript").Symbol | undefined} symbol
     * @param {"Run" | "Task"} name
     */
    const isEvoluSymbol = (symbol, name) => {
      const resolved = resolveSymbol(symbol);
      return (
        resolved?.getName() === name &&
        resolved.declarations?.some((declaration) => {
          const fileName = declaration.getSourceFile().fileName;
          return fileName.endsWith("/packages/common/src/Task.ts");
        }) === true
      );
    };

    /**
     * @param {import("typescript").TypeNode} node
     * @param {"Run" | "Task"} name
     * @param {Set<import("typescript").Symbol>} seenSymbols
     * @returns {boolean}
     */
    const typeNodeResolvesToEvolu = (node, name, seenSymbols) => {
      if (ts.isTypeReferenceNode(node)) {
        const symbol = resolveSymbol(
          checker.getSymbolAtLocation(node.typeName),
        );
        if (isEvoluSymbol(symbol, name)) return true;

        if (symbol && !seenSymbols.has(symbol)) {
          seenSymbols.add(symbol);
          if (
            symbol.declarations?.some(
              (declaration) =>
                ts.isTypeAliasDeclaration(declaration) &&
                typeNodeResolvesToEvolu(declaration.type, name, seenSymbols),
            )
          )
            return true;
        }
      }

      if (ts.isParenthesizedTypeNode(node))
        return typeNodeResolvesToEvolu(node.type, name, seenSymbols);

      if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node))
        return node.types.some((type) =>
          typeNodeResolvesToEvolu(type, name, seenSymbols),
        );

      return false;
    };

    /** @param {import("typescript").Type} type */
    const isEvoluTaskType = (type) => {
      if (isEvoluSymbol(type.aliasSymbol, "Task")) return true;

      return (
        type.aliasSymbol?.declarations?.some(
          (declaration) =>
            ts.isTypeAliasDeclaration(declaration) &&
            typeNodeResolvesToEvolu(declaration.type, "Task", new Set()),
        ) === true
      );
    };

    return {
      CallExpression(node) {
        const tsNode = /** @type {import("typescript").CallExpression} */ (
          esTreeNodeToTSNodeMap.get(node)
        );
        const calleeType = checker.getTypeAtLocation(tsNode.expression);

        if (isEvoluTaskType(calleeType)) {
          context.report({ node, messageId: "directTaskCall" });
          return;
        }

        const signature = checker.getResolvedSignature(tsNode);
        for (let index = 0; index < node.arguments.length; index += 1) {
          const parameter = signature?.parameters.at(
            Math.min(index, signature.parameters.length - 1),
          );
          if (
            parameter?.declarations?.some(
              (declaration) =>
                ts.isParameter(declaration) &&
                declaration.type !== undefined &&
                typeNodeResolvesToEvolu(declaration.type, "Run", new Set()),
            ) !== true
          )
            continue;

          context.report({ node, messageId: "directRunArgument" });
          return;
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
    "no-direct-task-call": noDirectTaskCall,
    "require-pure-annotation": requirePureAnnotation,
  },
};

/** @type {Record<string, import("eslint").Linter.Config>} */
export const configs = {
  recommended: {
    plugins: { evolu: plugin },
    rules: {
      "evolu/no-direct-task-call": "error",
      "evolu/require-pure-annotation": "error",
    },
  },
};

export default plugin;
