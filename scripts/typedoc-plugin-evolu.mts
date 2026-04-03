/**
 * TypeDoc plugin for Evolu documentation.
 *
 * Handles Evolu Type patterns:
 *
 * 1. `interface X extends InferType<typeof X>` - copies comment from `const X`
 * 2. `type X = typeof X.Type` - copies comment and resolves the type
 * 3. `const X = <EvoluType>` - shows source instead of expanded type
 *
 * The plugin runs in two phases:
 *
 * - Converter phase (EVENT_CREATE_DECLARATION, EVENT_RESOLVE_END): Captures type
 *   info while we have access to the TypeScript program, and copies comments.
 * - Renderer phase (BEGIN): Replaces types with simplified versions after
 *   monorepo packages are merged, avoiding serialization warnings.
 */

import type { Application, Context } from "typedoc";
import {
  Converter,
  DeclarationReflection,
  IntrinsicType,
  ReflectionKind,
  RendererEvent,
  TypeScript as ts,
} from "typedoc";

/**
 * Create a stable key for a reflection that survives monorepo merge.
 * Reflections get recreated during merge, so we can't use the reflection object
 * as a key.
 */
const getReflKey = (refl: DeclarationReflection): string =>
  `${refl.parent?.name ?? ""}::${refl.name}`;

/** Resolved type strings for Pattern 2 (type aliases). */
const resolvedTypes = new Map<string, string>();

/** Simplified source code for Pattern 3 (const declarations). */
const simplifiedSources = new Map<string, string>();

export const load = (app: Application): void => {
  // Converter phase: Capture type info while we have access to the TS program
  app.converter.on(
    Converter.EVENT_CREATE_DECLARATION,
    (context: Context, refl: DeclarationReflection) => {
      // Pattern 2: type X = typeof X.Type
      if (refl.kindOf(ReflectionKind.TypeAlias)) {
        const symbol = context.getSymbolFromReflection(refl);
        const declaration = symbol
          ?.getDeclarations()
          ?.find(ts.isTypeAliasDeclaration);
        if (!declaration) return;

        const typeNode = declaration.type;
        if (!ts.isTypeQueryNode(typeNode)) return;
        const exprName = typeNode.exprName;
        if (!ts.isQualifiedName(exprName) || exprName.right.text !== "Type")
          return;

        const checker = context.program.getTypeChecker();
        const resolvedType = checker.getTypeAtLocation(declaration);
        const typeString = checker.typeToString(
          resolvedType,
          declaration,
          ts.TypeFormatFlags.NoTruncation,
        );

        resolvedTypes.set(getReflKey(refl), typeString);
      }

      // Pattern 3: const X = object({...}) or brand(...) etc.
      if (refl.kindOf(ReflectionKind.Variable)) {
        const symbol = context.getSymbolFromReflection(refl);
        const declaration = symbol
          ?.getDeclarations()
          ?.find(ts.isVariableDeclaration);
        if (!declaration?.initializer) return;

        const checker = context.program.getTypeChecker();
        const source = getEvoluTypeSource(declaration.initializer, checker);
        if (source) {
          simplifiedSources.set(getReflKey(refl), source);
        }
      }
    },
  );

  // Converter phase: Copy comments (must happen before merge)
  app.converter.on(
    Converter.EVENT_RESOLVE_END,
    (context: Context) => {
      for (const refl of Object.values(context.project.reflections)) {
        if (!(refl instanceof DeclarationReflection)) continue;
        if (refl.comment?.summary.length) continue;

        // Pattern 1: interface X extends InferType<typeof X>
        if (refl.kindOf(ReflectionKind.Interface)) {
          const extendsInferType = refl.extendedTypes?.some((type) => {
            if (type.type !== "reference") return false;
            return (
              type.name === "InferType" || type.qualifiedName === "InferType"
            );
          });

          if (extendsInferType) {
            copyCommentFromConst(refl);
          }
        }

        // Pattern 2: type X = typeof X.Type
        if (
          refl.kindOf(ReflectionKind.TypeAlias) &&
          resolvedTypes.has(getReflKey(refl))
        ) {
          copyCommentFromConst(refl);
        }
      }
    },
    1000,
  );

  // Renderer phase: Replace types (must happen after merge to avoid warnings)
  app.renderer.on(RendererEvent.BEGIN, (event: RendererEvent) => {
    for (const refl of Object.values(event.project.reflections)) {
      if (!(refl instanceof DeclarationReflection)) continue;

      const key = getReflKey(refl);

      // Pattern 3: const X = object({...})
      const source = simplifiedSources.get(key);
      if (source && refl.kindOf(ReflectionKind.Variable)) {
        refl.type = new IntrinsicType(source);
      }

      // Pattern 2: type X = typeof X.Type
      const typeString = resolvedTypes.get(key);
      if (typeString && refl.kindOf(ReflectionKind.TypeAlias)) {
        refl.type = new IntrinsicType(typeString);
      }
    }
  });
};

/**
 * Check if a type is an Evolu Type by looking for the EvoluTypeSymbol property.
 * The symbol appears as `__@EvoluTypeSymbol@<id>` in the type system.
 */
const isEvoluType = (type: ts.Type): boolean =>
  type.getProperties().some((p) => p.name.startsWith("__@EvoluTypeSymbol"));

/**
 * Extract source code for call expressions that return an Evolu Type. Returns
 * the source text if the result is an Evolu Type, undefined otherwise.
 */
const getEvoluTypeSource = (
  node: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined => {
  if (!ts.isCallExpression(node)) return undefined;

  const resultType = checker.getTypeAtLocation(node);
  if (!isEvoluType(resultType)) return undefined;

  return node.getText();
};

/**
 * Copy JSDoc comment from a same-named const declaration to this reflection.
 * Used for interfaces and type aliases that derive from a const Evolu Type.
 */
const copyCommentFromConst = (refl: DeclarationReflection): void => {
  const parent = refl.parent;
  if (!parent || !("children" in parent)) return;

  const siblings = (parent as { children?: Array<DeclarationReflection> })
    .children;
  const constDecl = siblings?.find(
    (sibling) =>
      sibling.name === refl.name &&
      sibling.kindOf(ReflectionKind.Variable) &&
      sibling.comment?.summary.length,
  );

  if (constDecl?.comment) {
    refl.comment = constDecl.comment.clone();
  }
};
