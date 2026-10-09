/**
 * Generates `src/CApi.ts` and `src/Constants.ts` from SQLite's own metadata.
 *
 * Inputs, pinned in `scripts/upstream` from the one release the binary is built
 * from, SQLite 3.53.4:
 *
 * - `sqlite3-api-glue.c-pp.js`: SQLite's JavaScript glue, verbatim from
 *   `ext/wasm/api` of sqlite-src-3530400.zip. Its `bindingSignatures` table
 *   gives the C types of the functions SQLite's JavaScript binds.
 * - `sqlite3-wasm-enum.json`: the exact bytes of the string
 *   `sqlite3__wasm_enum_json()` returns in the binary, with every SQLITE_*
 *   constant, `SQLITE_WASM_DEALLOC` and the struct layouts.
 * - `sqlite3-wasm-imports.json`: every import of the binary, as `module.name`,
 *   with its kind and type: a function's wasm type, or a memory's limits.
 *   Generation does not read it; it pins the imports the loader implements by
 *   hand.
 * - `sqlite3-wasm-exports.json`: every export of the binary with its kind, and
 *   each function's wasm type, sorted by name.
 *
 * `scripts/bindings.mts` holds the metadata of each C function: documentation,
 * parameter names, and refinements of the table's types.
 *
 * Coverage comes from the binary, not from the table. Every exported function
 * named `sqlite3_*`, `sqlite3session_*`, `sqlite3changeset_*` or
 * `sqlite3changegroup_*`, except the `sqlite3__wasm_*` internals, is public C
 * API and needs metadata, and metadata for any other name, or for a function
 * the binary does not export, fails. The table is a type source only, including
 * entries its runtime feature checks would skip. It is not a faithful C ABI: it
 * declares some int-returning functions as void and omits functions SQLite
 * binds by hand, so the metadata corrects and supplements it, and every
 * binding's wasm type must equal the pinned one.
 *
 * The variadic `sqlite3_config`, `sqlite3_db_config` and `sqlite3_vtab_config`
 * are not exported, so coverage cannot ask for them; their metadata names the
 * build's `sqlite3__wasm_*` shims that call them with fixed arguments, and the
 * options each shim takes. Each shim's wasm type must equal the pinned one,
 * each option must be a constant of the pinned build, every constant with the
 * function's option prefix must be taken by a variant or listed in
 * unsupportedOps, and a variadic function the binary starts to export fails.
 *
 * Generation lists every problem and writes nothing when there is one.
 *
 * Usage:
 *
 * - `node scripts/generate.mts` regenerates the outputs.
 * - `node scripts/generate.mts --check` fails when the outputs are stale. It
 *   needs no binary.
 * - `node scripts/generate.mts --pin-build <wasm>` pins a binary: it writes the
 *   enum JSON, the imports JSON and the exports JSON. Regenerate afterwards.
 * - `node scripts/generate.mts --verify-build <wasm>` fails when a binary's enum
 *   JSON, imports or exports differ from the pins, for CI after building it.
 *   Code and build settings that change none of them are not compared.
 */

import {
  err,
  fnv1a32,
  isNonEmptyArray,
  mapArray,
  ok,
  type NonEmptyReadonlyArray,
  type Result,
  type Typed,
} from "@evolu/common";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { format, resolveConfig } from "prettier";
import {
  createSourceFile,
  forEachChild,
  isArrayLiteralExpression,
  isBinaryExpression,
  isCallExpression,
  isConditionalExpression,
  isIdentifier,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isVariableDeclaration,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  type Expression,
  type Node,
  type ObjectLiteralExpression,
} from "typescript";
import {
  bindings,
  variadicBindings,
  type Binding,
  type VariadicBinding,
  type VariadicVariant,
} from "./bindings.mts";

// The table's types, with the TypeScript type and wasm value type each maps
// to. A table type not listed here fails generation when a binding uses it. A
// callback argument the table adapts with `wasm.xWrap.FuncPtrAdapter` is read
// as `funcptr:` followed by the callback's signature in SQLite's notation, such
// as `funcptr:i(pi)`, which maps to SqliteFunctionPtr; supplements may use it
// too.
const tableTypes: Readonly<
  Record<string, { readonly ts: string; readonly wasm: WasmValueType }>
> = {
  int: { ts: "number", wasm: "i" },
  "int*": { ts: "WasmPtr", wasm: "i" },
  i64: { ts: "bigint", wasm: "j" },
  f64: { ts: "number", wasm: "d" },
  "*": { ts: "WasmPtr", wasm: "i" },
  "**": { ts: "WasmPtr", wasm: "i" },
  "void*": { ts: "WasmPtr", wasm: "i" },
  string: { ts: "CStringPtr", wasm: "i" },
  "string:static": { ts: "CStringPtr", wasm: "i" },
  "string:flexible": { ts: "CStringPtr", wasm: "i" },
  "string:dealloc": { ts: "SqliteOwnedCStringPtr", wasm: "i" },
  "sqlite3*": { ts: "SqliteDbPtr", wasm: "i" },
  "sqlite3_context*": { ts: "SqliteContextPtr", wasm: "i" },
  sqlite3_filename: { ts: "SqliteFilenamePtr", wasm: "i" },
  "sqlite3_index_info*": { ts: "SqliteIndexInfoPtr", wasm: "i" },
  "sqlite3_stmt*": { ts: "SqliteStmtPtr", wasm: "i" },
  "sqlite3_value*": { ts: "SqliteValuePtr", wasm: "i" },
  "sqlite3_vfs*": { ts: "SqliteVfsPtr", wasm: "i" },
  void: { ts: "void", wasm: "v" },
};

const functionPointerPrefix = "funcptr:";

// Types a binding may narrow to, with their wasm value type and module. Every
// branded type a table type maps to must be here, so the output imports it.
const narrowTypes: Readonly<
  Record<
    string,
    { readonly wasm: WasmValueType; readonly module: GeneratedImport }
  >
> = {
  CStringPtr: { wasm: "i", module: "./Pointer.ts" },
  NullPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteContextPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteDataType: { wasm: "i", module: "./Constants.ts" },
  SqliteDbPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteDestructor: { wasm: "i", module: "./Pointer.ts" },
  SqliteFilePtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteFilenamePtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteFunctionPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteIndexInfoPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteLockLevel: { wasm: "i", module: "./Constants.ts" },
  SqliteOwnedCStringPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteOwnedPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteOwnedValuePtr: { wasm: "i", module: "./Pointer.ts" },
  SqlitePrimaryResultCode: { wasm: "i", module: "./Constants.ts" },
  SqliteResultCode: { wasm: "i", module: "./Constants.ts" },
  SqliteStmtPtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteValuePtr: { wasm: "i", module: "./Pointer.ts" },
  SqliteVfsPtr: { wasm: "i", module: "./Pointer.ts" },
  WasmPtr: { wasm: "i", module: "./Pointer.ts" },
};

// The constant groups of sqlite3__wasm_enum_json(), in output order. `limits`
// also holds SQLITE_MAX_* build settings, which are skipped. A group neither
// listed here nor handled by emitConstants fails generation.
const constantGroups: ReadonlyArray<readonly [group: string, title: string]> = [
  ["resultCodes", "Result codes."],
  ["dataTypes", "Fundamental data types."],
  ["openFlags", "Flags for sqlite3_open_v2 and the VFS xOpen method."],
  ["prepareFlags", "Flags for sqlite3_prepare_v3."],
  ["stmtStatus", "Counters for sqlite3_stmt_status."],
  ["limits", "Limit categories for sqlite3_limit."],
  ["serialize", "Flags for sqlite3_serialize and sqlite3_deserialize."],
  ["access", "Flags for the VFS xAccess method."],
  ["flock", "File lock levels for the VFS xLock and xUnlock methods."],
  ["syncFlags", "Flags for the VFS xSync method."],
  [
    "ioCap",
    "Device characteristics for the VFS xDeviceCharacteristics method.",
  ],
  [
    "fcntl",
    "Opcodes for sqlite3_file_control and the VFS xFileControl method.",
  ],
  ["encodings", "Text encodings."],
  ["txnState", "Transaction states sqlite3_txn_state returns."],
  ["config", "Options for sqlite3_config."],
  ["dbConfig", "Options for sqlite3_db_config."],
  ["sqlite3Status", "Counters for sqlite3_status and sqlite3_status64."],
  ["dbStatus", "Counters for sqlite3_db_status and sqlite3_db_status64."],
  ["udfFlags", "Flags for sqlite3_create_function_v2."],
  [
    "authorizer",
    "Authorizer action codes and results, and update hook operations.",
  ],
  ["trace", "Event codes for sqlite3_trace_v2."],
  [
    "vtab",
    "Virtual table constraint operators, scan flags, options and conflict modes.",
  ],
  [
    "session",
    "Options for sqlite3session_config and sqlite3session_object_config.",
  ],
  ["changeset", "Flags and conflict codes of the changeset functions."],
];

// The struct layouts of sqlite3__wasm_enum_json() to emit, in output order. A
// struct neither listed here nor in skippedStructs fails generation.
const layoutStructs: ReadonlyArray<string> = [
  "sqlite3_vfs",
  "sqlite3_io_methods",
  "sqlite3_file",
  "sqlite3_module",
  "sqlite3_vtab",
  "sqlite3_vtab_cursor",
  "sqlite3_index_info",
  "sqlite3_index_constraint",
  "sqlite3_index_orderby",
  "sqlite3_index_constraint_usage",
];

// Structs of SQLite's kvvfs, which this package does not ship.
const skippedStructs: ReadonlySet<string> = new Set([
  "sqlite3_kvvfs_methods",
  "KVVfsFile",
]);

type WasmValueType = "i" | "j" | "d" | "v";

type GeneratedImport = "./Constants.ts" | "./Pointer.ts";

/** An entry of SQLite's signature table, in the table's syntax. */
export interface TableEntry {
  readonly result: string;
  readonly args: ReadonlyArray<string | UnsupportedTableArg>;
}

/** A table argument the generator cannot read, as its source text. */
export interface UnsupportedTableArg {
  readonly unsupported: string;
}

interface ResolvedParam {
  readonly name: string;
  readonly ts: string;
  readonly wasm: WasmValueType;
  /** Omittable by the caller, and then passed as 0. */
  readonly optional: boolean;
}

interface ResolvedSignature {
  readonly params: ReadonlyArray<ResolvedParam>;
  readonly result: string;
  readonly wasmType: string;
  /** As the table or the metadata writes it, before any correction. */
  readonly signature: ReadonlyArray<string>;
}

interface ResolvedBinding extends ResolvedSignature {
  readonly name: string;
  readonly binding: Binding;
  readonly overloads: ReadonlyArray<
    Pick<ResolvedSignature, "params" | "result">
  >;
}

interface ResolvedVariadic {
  readonly name: string;
  readonly binding: VariadicBinding;
  /** The parameters before the option. */
  readonly params: ReadonlyArray<ResolvedParam>;
  readonly variants: ReadonlyArray<ResolvedVariant>;
}

interface ResolvedVariant extends ResolvedSignature {
  readonly variant: VariadicVariant;
  /** The arguments after the option. */
  readonly args: ReadonlyArray<ResolvedParam>;
  /** The option's TypeScript type. */
  readonly opType: string;
}

/**
 * An export as `sqlite3-wasm-exports.json` writes it. A function's type uses
 * the notation `i(ij)`: the result, or `v` for none, then the parameters, with
 * `i` for i32, `j` for i64, `f` for f32 and `d` for f64.
 */
export type PinnedExport =
  | { readonly kind: "function"; readonly type: string }
  | { readonly kind: "table" | "memory" | "global" | "tag" };

export type PinnedExports = Readonly<Record<string, PinnedExport>>;

/**
 * An import as `sqlite3-wasm-imports.json` writes it, keyed `module.name`. The
 * type is a function's or tag's wasm type in the notation of
 * {@link PinnedExport}; a memory's limits as `min` or `min-max`, followed by
 * `flags` and the flags byte when it has flags other than the maximum; a
 * table's reference type byte and limits; or a global's value type, followed by
 * `mut` when mutable.
 */
export interface PinnedImport {
  readonly kind: "function" | "table" | "memory" | "global" | "tag";
  readonly type: string;
}

export type PinnedImports = Readonly<Record<string, PinnedImport>>;

/** What the pins hold of a binary. */
export interface WasmBuild {
  readonly enumJson: Uint8Array;
  readonly imports: PinnedImports;
  readonly exports: PinnedExports;
}

interface WasmEnumJson {
  readonly structs: ReadonlyArray<{
    readonly name: string;
    readonly sizeof: number;
    readonly members: Readonly<
      Record<string, { readonly offset: number; readonly signature: string }>
    >;
  }>;
  readonly [group: string]: unknown;
}

const packageDirectory = new URL("../", import.meta.url);

// The inputs and outputs, relative to a package directory.
const gluePath = "scripts/upstream/sqlite3-api-glue.c-pp.js";
const enumJsonPath = "scripts/upstream/sqlite3-wasm-enum.json";
const importsJsonPath = "scripts/upstream/sqlite3-wasm-imports.json";
const exportsJsonPath = "scripts/upstream/sqlite3-wasm-exports.json";
const cApiPath = "src/CApi.ts";
const constantsPath = "src/Constants.ts";

/**
 * Runs the command line the module documentation describes on the package in a
 * directory, whose `scripts/upstream` holds the inputs and `src` the outputs,
 * and returns the exit code.
 */
export const runGenerateCli = async (
  args: ReadonlyArray<string>,
  directory: URL,
): Promise<number> => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      check: { type: "boolean", default: false },
      "pin-build": { type: "string" },
      "verify-build": { type: "string" },
    },
  });

  const pinBuild = values["pin-build"];
  if (pinBuild != null) {
    const build = await readWasmBuild(readFileSync(pinBuild));
    writeFileSync(new URL(enumJsonPath, directory), build.enumJson);
    writeFileSync(
      new URL(importsJsonPath, directory),
      pinnedJson(build.imports),
    );
    writeFileSync(
      new URL(exportsJsonPath, directory),
      pinnedJson(build.exports),
    );
    log(
      `Pinned ${pinBuild}, build hash ${hex(buildHash(build))}. Regenerate with node scripts/generate.mts.`,
    );
    return 0;
  }

  const verifyBuild = values["verify-build"];
  if (verifyBuild != null) {
    const differences = compareWasmBuilds(
      readPinnedBuild(directory),
      await readWasmBuild(readFileSync(verifyBuild)),
    );
    for (const difference of differences) log(difference);
    if (differences.length === 0) {
      log(`${verifyBuild} matches the pins.`);
      return 0;
    }
    log(`${verifyBuild} differs from the pins; pin it with --pin-build.`);
    return 1;
  }

  const generated = await generate({
    glue: readFileSync(new URL(gluePath, directory), "utf8"),
    pinned: readPinnedBuild(directory),
    bindings,
    variadicBindings,
  });
  if (!generated.ok) {
    for (const problem of generated.error.problems) log(problem);
    return 1;
  }

  const sources = [
    [new URL(cApiPath, directory), generated.value.cApi],
    [new URL(constantsPath, directory), generated.value.constants],
  ] as const;
  if (!values.check) {
    for (const [path, content] of sources) writeFileSync(path, content);
    return 0;
  }
  const stale = findStaleSources(sources);
  for (const path of stale)
    log(`${path.pathname} is stale; run node scripts/generate.mts.`);
  return stale.length === 0 ? 0 : 1;
};

/** What generation reads. */
export interface GenerateInputs {
  /** The source of `sqlite3-api-glue.c-pp.js`, before preprocessing. */
  readonly glue: string;
  readonly pinned: WasmBuild;
  readonly bindings: Readonly<Record<string, Binding>>;
  readonly variadicBindings: Readonly<Record<string, VariadicBinding>>;
}

/** The formatted contents of `src/CApi.ts` and `src/Constants.ts`. */
export interface GeneratedSources {
  readonly cApi: string;
  readonly constants: string;
}

/** The problems of the metadata, one message each. */
export interface GenerateError extends Typed<"GenerateError"> {
  readonly problems: NonEmptyReadonlyArray<string>;
}

/**
 * Checks the metadata against SQLite's table and the pinned build, and emits
 * the sources. Every problem of the metadata is listed; a table or enum JSON
 * the generator cannot read throws.
 */
export const generate = async ({
  glue,
  pinned,
  bindings,
  variadicBindings,
}: GenerateInputs): Promise<Result<GeneratedSources, GenerateError>> => {
  // The glue is preprocessed as for the build, which defines no c-pp symbol
  // the table depends on, such as enable-see.
  const table = parseSignatureTable(preprocessCpp(glue, new Set()), [
    ...Object.keys(bindings),
    ...Object.values(variadicBindings).flatMap(({ variants }) =>
      variants.map(({ shim }) => shim),
    ),
  ]);

  const enumJson = parseEnumJson(pinned.enumJson);
  const constants = new Set(
    constantGroups.flatMap(([group]) =>
      groupConstants(enumJson, group).map(([name]) => name),
    ),
  );

  const problems: Array<string> = [];
  // Resolves one entry, or records why it cannot be.
  const collect = <T,>(resolve: () => T): ReadonlyArray<T> => {
    try {
      return [resolve()];
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  };

  const resolved = Object.entries(bindings).flatMap(([name, binding]) =>
    collect(() => resolveBinding(name, binding, table, pinned.exports)),
  );
  const resolvedVariadics = Object.entries(variadicBindings).flatMap(
    ([name, variadic]) =>
      collect(() =>
        resolveVariadic(
          name,
          variadic,
          table,
          pinned.exports,
          constants,
          bindings,
        ),
      ),
  );

  const missing: Array<string> = [];
  for (const [name, pinnedExport] of Object.entries(pinned.exports)) {
    if (!isPublicCName(name)) continue;
    if (pinnedExport.kind !== "function")
      problems.push(
        `${name}: a public C name, but the binary exports a ${pinnedExport.kind}`,
      );
    else if (!(name in bindings)) missing.push(name);
  }
  for (const name of missing)
    problems.push(
      `${name}: exported, but scripts/bindings.mts has no metadata`,
    );
  if (missing.length > 0)
    problems.push(
      `${missing.length} exported C functions lack metadata in scripts/bindings.mts.`,
    );

  if (isNonEmptyArray(problems))
    return err({ type: "GenerateError", problems });

  return ok({
    cApi: await formatTypeScript(
      new URL(cApiPath, packageDirectory),
      emitCApi(resolved, resolvedVariadics),
    ),
    constants: await formatTypeScript(
      new URL(constantsPath, packageDirectory),
      emitConstants(pinned, enumJson),
    ),
  });
};

/** Lists the paths whose content differs from the generated source. */
export const findStaleSources = (
  sources: ReadonlyArray<readonly [path: URL, content: string]>,
): ReadonlyArray<URL> =>
  sources
    .filter(([path, content]) => readFileSync(path, "utf8") !== content)
    .map(([path]) => path);

/**
 * Whether an export is public C API: a function of SQLite or its session
 * extension. The `sqlite3__wasm_*` shims are the build's internals; malloc,
 * free, realloc and Emscripten's stack functions are not SQLite's.
 */
const isPublicCName = (name: string): boolean =>
  /^sqlite3(?:session|changeset|changegroup)?_(?!_)/u.test(name);

/**
 * Runs the subset of SQLite's c-pp preprocessor the glue uses: `//#define`,
 * `//#if [not] symbol`, `//#else` and `//#/if`. Excluded lines become empty so
 * line numbers stay stable. Any other directive fails, so an upstream change in
 * how the table is assembled cannot pass unnoticed.
 */
export const preprocessCpp = (
  source: string,
  defines: ReadonlySet<string>,
): string => {
  const defined = new Set(defines);
  const frames: Array<{
    readonly parentActive: boolean;
    readonly condition: boolean;
  }> = [];
  let active = true;

  return source
    .split("\n")
    .map((line, index) => {
      const directive = /^\s*\/\/#(\S+)\s*(.*)$/u.exec(line);
      if (directive == null) return active ? line : "";
      const [, keyword = "", rest = ""] = directive;
      const location = `sqlite3-api-glue.c-pp.js:${index + 1}`;
      switch (keyword) {
        case "define": {
          const [symbol = ""] = rest.split(/\s+/u);
          if (active) defined.add(symbol);
          break;
        }
        case "if": {
          const condition = /^(not\s+)?(\S+)$/u.exec(rest.trim());
          if (condition == null)
            throw new Error(`${location}: unsupported condition ${rest}`);
          const [, not, symbol = ""] = condition;
          const holds = defined.has(symbol) !== (not != null);
          frames.push({ parentActive: active, condition: holds });
          active = active && holds;
          break;
        }
        case "else": {
          const frame = frames.at(-1);
          if (frame == null) throw new Error(`${location}: #else without #if`);
          active = frame.parentActive && !frame.condition;
          break;
        }
        case "/if": {
          const frame = frames.pop();
          if (frame == null) throw new Error(`${location}: #/if without #if`);
          active = frame.parentActive;
          break;
        }
        default:
          throw new Error(`${location}: unsupported directive //#${keyword}`);
      }
      return "";
    })
    .join("\n");
};

/**
 * Collects the entries of the `bindingSignatures` object literal and of every
 * `bindingSignatures.<group>.push(...)` call. The `if` conditions around the
 * pushes are runtime feature checks, so they are ignored: the table is a type
 * source only, and the binary decides what needs a binding. More than one entry
 * for a bound name, a function or a shim the metadata names, fails.
 */
export const parseSignatureTable = (
  source: string,
  boundNames: ReadonlyArray<string>,
): ReadonlyMap<string, TableEntry> => {
  const entries = new Map<string, TableEntry>();
  const duplicates = new Set<string>();
  const sourceFile = createSourceFile(
    "sqlite3-api-glue.c-pp.js",
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.JS,
  );

  // Object literals bound to names, for FuncPtrAdapter options that spread
  // shared options such as `...__ipsProxy`.
  const objectLiterals = new Map<string, ObjectLiteralExpression>();
  const collectObjectLiterals = (node: Node): void => {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      node.initializer != null &&
      isObjectLiteralExpression(node.initializer)
    )
      objectLiterals.set(node.name.text, node.initializer);
    forEachChild(node, collectObjectLiterals);
  };
  collectObjectLiterals(sourceFile);

  const stringValue = (expression: Expression): string | undefined => {
    if (
      isStringLiteral(expression) ||
      isNoSubstitutionTemplateLiteral(expression)
    )
      return expression.text;
    if (isParenthesizedExpression(expression))
      return stringValue(expression.expression);
    if (
      isBinaryExpression(expression) &&
      expression.operatorToken.kind === SyntaxKind.PlusToken
    ) {
      const left = stringValue(expression.left);
      const right = stringValue(expression.right);
      return left == null || right == null ? undefined : left + right;
    }
    return undefined;
  };

  // The last `signature` wins, as in the object the options evaluate to.
  const adapterSignature = (
    options: ObjectLiteralExpression,
  ): string | undefined => {
    let signature: string | undefined;
    for (const property of options.properties) {
      if (
        isPropertyAssignment(property) &&
        isIdentifier(property.name) &&
        property.name.text === "signature"
      )
        signature = stringValue(property.initializer);
      else if (
        isSpreadAssignment(property) &&
        isIdentifier(property.expression)
      ) {
        const spread = objectLiterals.get(property.expression.text);
        const spreadSignature =
          spread == null ? undefined : adapterSignature(spread);
        if (spreadSignature != null) signature = spreadSignature;
      }
    }
    return signature;
  };

  const tableArg = (arg: Expression): string | UnsupportedTableArg => {
    if (isStringLiteral(arg)) return arg.text;
    // A constant condition, such as `true ? "*" : new FuncPtrAdapter(...)`.
    if (isConditionalExpression(arg)) {
      if (arg.condition.kind === SyntaxKind.TrueKeyword)
        return tableArg(arg.whenTrue);
      if (arg.condition.kind === SyntaxKind.FalseKeyword)
        return tableArg(arg.whenFalse);
    }
    if (
      isNewExpression(arg) &&
      arg.expression.getText() === "wasm.xWrap.FuncPtrAdapter"
    ) {
      const [options] = arg.arguments ?? [];
      const signature =
        options != null && isObjectLiteralExpression(options)
          ? adapterSignature(options)
          : undefined;
      if (signature != null) return `${functionPointerPrefix}${signature}`;
    }
    return { unsupported: arg.getText() };
  };

  const addEntries = (elements: ReadonlyArray<Expression>): void => {
    for (const element of elements) {
      if (!isArrayLiteralExpression(element)) continue;
      const [name, result, ...rest] = element.elements;
      if (name == null || !isStringLiteral(name) || result == null) continue;
      const [firstArg] = rest;
      const args =
        rest.length === 1 &&
        firstArg != null &&
        isArrayLiteralExpression(firstArg)
          ? firstArg.elements
          : rest;
      if (entries.has(name.text)) duplicates.add(name.text);
      entries.set(name.text, {
        result: isStringLiteral(result)
          ? result.text
          : isIdentifier(result) && result.text === "undefined"
            ? "void"
            : result.getText(),
        args: args.map(tableArg),
      });
    }
  };

  const visit = (node: Node): void => {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      node.name.text === "bindingSignatures" &&
      node.initializer != null &&
      isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties)
        if (
          isPropertyAssignment(property) &&
          isArrayLiteralExpression(property.initializer)
        )
          addEntries(property.initializer.elements);
    } else if (
      isCallExpression(node) &&
      isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "push" &&
      isPropertyAccessExpression(node.expression.expression) &&
      isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === "bindingSignatures"
    ) {
      addEntries(node.arguments);
    }
    forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const name of boundNames)
    if (duplicates.has(name))
      throw new Error(`${name}: SQLite's table has more than one entry`);
  if (entries.size === 0) throw new Error("No bindingSignatures entries found");
  return entries;
};

/**
 * Checks one metadata entry against the table and the pinned exports and
 * resolves its types.
 */
const resolveBinding = (
  name: string,
  binding: Binding,
  table: ReadonlyMap<string, TableEntry>,
  exports: PinnedExports,
): ResolvedBinding => {
  const fail = failFor(name);

  if (!isPublicCName(name))
    fail("not a public C function; remove its metadata");
  const pinnedExport = exports[name];
  const pinnedType =
    pinnedExport?.kind === "function"
      ? pinnedExport.type
      : fail("not a function the binary exports; remove its metadata");

  const tableEntry = table.get(name);
  if (tableEntry != null && binding.supplement != null)
    fail("SQLite's table now has it; remove the supplement");
  const entry: TableEntry =
    tableEntry ??
    (binding.supplement == null
      ? fail("not in SQLite's table; add a supplement")
      : signatureEntry(binding.supplement.signature));

  if (binding.correctedResult?.type === entry.result)
    fail("SQLite's table now agrees; remove the correction");

  const resultType = binding.correctedResult?.type ?? entry.result;
  const resolved = resolveSignature(fail, {
    name,
    entry,
    resultType,
    params: binding.params,
    result: binding.result,
    pinnedType,
  });
  const overloads = (binding.overloads ?? []).map(({ params, result }) =>
    resolveSignature(fail, {
      name,
      entry,
      resultType,
      params,
      result,
      pinnedType,
    }),
  );
  if (
    [resolved, ...overloads].some(({ params }) =>
      params.some((param) => param.optional),
    )
  )
    fail("only a variadic function's shim arguments can be optional");
  return { name, binding, ...resolved, overloads };
};

/**
 * Checks a variadic function's metadata against the table, the pinned exports
 * and the pinned constants, and resolves the types of its shims.
 */
const resolveVariadic = (
  name: string,
  binding: VariadicBinding,
  table: ReadonlyMap<string, TableEntry>,
  exports: PinnedExports,
  constants: ReadonlySet<string>,
  bindings: Readonly<Record<string, Binding>>,
): ResolvedVariadic => {
  const fail = failFor(name);

  if (exports[name] != null)
    fail("the binary exports it now; move its metadata to bindings");
  if (name in bindings) fail("both bindings and variadicBindings have it");
  if (binding.otherOps == null && binding.variants.length > 1)
    fail("more than one variant needs otherOps");
  if (binding.otherOps != null && !constants.has(binding.otherOps))
    fail(`otherOps: the build has no constant ${binding.otherOps}`);
  const isShim = binding.otherOps == null;
  const leadingCount = binding.params.length;

  const listedOps = new Set<string>();
  const variants = mapArray(binding.variants, (variant): ResolvedVariant => {
    const failVariant = failFor(`${name} (${variant.shim})`);

    const pinnedExport = exports[variant.shim];
    const pinnedType =
      pinnedExport?.kind === "function"
        ? pinnedExport.type
        : failVariant("not a function the binary exports");

    const entry = signatureEntry(variant.signature);
    const tableEntry = table.get(variant.shim);
    if (
      tableEntry != null &&
      JSON.stringify(tableEntry) !== JSON.stringify(entry)
    )
      failVariant(
        `SQLite's table now has the signature ${JSON.stringify(tableEntry)}; use it`,
      );
    if (entry.args[leadingCount] !== "int")
      failVariant("the option must be an int argument after params");

    const resolved = resolveSignature(failVariant, {
      name: variant.shim,
      entry,
      resultType: entry.result,
      params: [...binding.params, "op", ...variant.args],
      result: "SqliteResultCode",
      pinnedType,
    });
    const args = resolved.params.slice(leadingCount + 1);
    if (resolved.params.slice(0, -1).some((param) => param.optional))
      failVariant("only the last argument can be optional");
    if (isShim && args.some((arg) => arg.optional))
      failVariant("a function that is its shim cannot omit an argument");

    for (const op of variant.ops) {
      if (!constants.has(op)) failVariant(`the build has no constant ${op}`);
      if (!op.startsWith(binding.opPrefix))
        failVariant(`${op} lacks the prefix ${binding.opPrefix}`);
      if (listedOps.has(op)) failVariant(`${op} is listed more than once`);
      listedOps.add(op);
    }
    if (variant.ops.length > 1 && variant.opType == null)
      failVariant("more than one option needs an opType");

    return {
      ...resolved,
      variant,
      args,
      opType: variant.opType?.name ?? `typeof ${variant.ops[0]}`,
    };
  });

  const unsupportedOps = new Set<string>();
  for (const op of binding.unsupportedOps) {
    if (!constants.has(op))
      fail(`unsupportedOps: the build has no constant ${op}`);
    if (!op.startsWith(binding.opPrefix))
      fail(`unsupportedOps: ${op} lacks the prefix ${binding.opPrefix}`);
    if (listedOps.has(op)) fail(`unsupportedOps: a variant takes ${op}`);
    if (unsupportedOps.has(op))
      fail(`unsupportedOps: ${op} is listed more than once`);
    unsupportedOps.add(op);
  }
  const undecidedOps = [...constants].filter(
    (op) =>
      op.startsWith(binding.opPrefix) &&
      !listedOps.has(op) &&
      !unsupportedOps.has(op),
  );
  if (undecidedOps.length > 0)
    fail(
      `options neither a variant nor unsupportedOps lists: ${undecidedOps.join(", ")}; check how SQLite's JavaScript and the build's shims dispatch them`,
    );

  const [first] = variants;
  const params = first.params.slice(0, leadingCount);
  for (const { params: variantParams } of variants)
    if (
      variantParams
        .slice(0, leadingCount)
        .some(
          (param, index) =>
            param.name !== params[index]?.name ||
            param.ts !== params[index]?.ts,
        )
    )
      fail("the variants disagree on the parameters before the option");

  return { name, binding, params, variants };
};

const failFor =
  (name: string) =>
  (message: string): never => {
    throw new Error(`${name}: ${message}`);
  };

const signatureEntry = (
  signature: readonly [result: string, ...args: Array<string>],
): TableEntry => ({ result: signature[0], args: signature.slice(1) });

/**
 * Resolves the TypeScript and wasm types of a signature with the metadata's
 * parameter names and narrowings, and checks its wasm type against the pinned
 * one.
 */
const resolveSignature = (
  fail: (message: string) => never,
  {
    name,
    entry,
    resultType,
    params,
    result,
    pinnedType,
  }: {
    name: string;
    entry: TableEntry;
    /** The table's result type after any correction. */
    resultType: string;
    params: ReadonlyArray<string>;
    result: string | undefined;
    pinnedType: string;
  },
): ResolvedSignature => {
  const tableType = (type: string | UnsupportedTableArg) => {
    if (typeof type !== "string")
      return fail(`unsupported table argument ${type.unsupported}`);
    if (type.startsWith(functionPointerPrefix))
      return { ts: "SqliteFunctionPtr", wasm: "i" } as const;
    return tableTypes[type] ?? fail(`unsupported table type ${type}`);
  };

  const narrow = (ts: string, wasm: WasmValueType, what: string): string => {
    for (const part of ts.split("|").map((type) => type.trim())) {
      if (wasm === "i" && /^(?:0|[1-9]\d*)$/u.test(part)) continue;
      const narrowType = narrowTypes[part];
      if (narrowType == null) fail(`${what}: unknown type ${part}`);
      else if (narrowType.wasm !== wasm)
        fail(`${what}: ${part} is not a wasm ${wasm}`);
    }
    return ts;
  };

  if (params.length !== entry.args.length)
    fail(`${params.length} parameter names for ${entry.args.length} arguments`);

  const resolvedParams = entry.args.map((arg, index): ResolvedParam => {
    const spec = params[index];
    const colon = spec.indexOf(":");
    const declared = (colon < 0 ? spec : spec.slice(0, colon)).trim();
    const override = colon < 0 ? undefined : spec.slice(colon + 1).trim();
    const optional = declared.endsWith("?");
    const paramName = optional ? declared.slice(0, -1) : declared;
    const type = tableType(arg);
    return {
      name: paramName,
      ts:
        override == null
          ? type.ts
          : narrow(override, type.wasm, `parameter ${paramName}`),
      wasm: type.wasm,
      optional,
    };
  });

  const resultTableType = tableType(resultType);
  const wasmType = `${resultTableType.wasm}(${resolvedParams.map((param) => param.wasm).join("")})`;
  if (pinnedType !== wasmType)
    fail(
      `the signature gives wasm type ${wasmType}, but the binary exports ${pinnedType}`,
    );

  return {
    params: resolvedParams,
    result:
      result == null
        ? resultTableType.ts
        : narrow(result, resultTableType.wasm, "result"),
    wasmType,
    signature: [
      JSON.stringify(name),
      entry.result === "void" ? "undefined" : JSON.stringify(entry.result),
      ...entry.args.map((arg) => JSON.stringify(arg)),
    ],
  };
};

const emitCApi = (
  resolved: ReadonlyArray<ResolvedBinding>,
  variadics: ReadonlyArray<ResolvedVariadic>,
): string => {
  const variants = variadics.flatMap(({ variants }) => variants);
  const cNames = [
    ...resolved.map(({ name }) => name),
    ...variadics.map(({ name }) => name),
  ];
  const jsDoc = (text: string, self: string, indent = ""): Array<string> => [
    `${indent}/**`,
    ...linkCNames(text, cNames, self)
      .split("\n")
      .map((line) => (line === "" ? `${indent} *` : `${indent} * ${line}`)),
    `${indent} */`,
  ];

  const typeNames = new Set<string>();
  for (const { params, result } of [
    ...resolved,
    ...resolved.flatMap(({ overloads }) => overloads),
    ...variants,
  ])
    for (const type of [...params.map((param) => param.ts), result])
      for (const part of type.split("|").map((name) => name.trim()))
        if (part in narrowTypes) typeNames.add(part);

  const importsByModule = new Map<GeneratedImport, Array<string>>();
  for (const typeName of [...typeNames].toSorted()) {
    const narrowType = narrowTypes[typeName];
    const names = importsByModule.get(narrowType.module) ?? [];
    names.push(`type ${typeName}`);
    importsByModule.set(narrowType.module, names);
  }
  // The options a variadic function dispatches and the result code it returns
  // for any other option are values; the options of one that is its shim only
  // appear in its option type.
  const optionImports = [
    ...new Set(
      variadics.flatMap(({ binding, variants }) => {
        const ops = variants.flatMap(({ variant }) => variant.ops);
        return binding.otherOps == null
          ? ops.map((op) => `type ${op}`)
          : [...ops, binding.otherOps];
      }),
    ),
  ].toSorted((a, b) =>
    a.replace(/^type /u, "").localeCompare(b.replace(/^type /u, "")),
  );
  importsByModule.set("./Constants.ts", [
    ...optionImports,
    ...(importsByModule.get("./Constants.ts") ?? []),
  ]);

  const imports = [...importsByModule.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([module, names]) =>
      names.every((name) => name.startsWith("type "))
        ? `import type { ${names.map((name) => name.slice(5)).join(", ")} } from "${module}";`
        : `import { ${names.join(", ")} } from "${module}";`,
    );

  const parameterList = (
    params: ReadonlyArray<ResolvedParam>,
    { optional }: { optional: boolean },
  ): string =>
    params
      .map(
        (param) =>
          `${param.name}${optional && param.optional ? "?" : ""}: ${param.ts}`,
      )
      .join(", ");

  const functionType = (
    params: ReadonlyArray<ResolvedParam>,
    result: string,
  ): string => `(${parameterList(params, { optional: false })}) => ${result}`;

  const provenance = ({ binding, signature }: ResolvedBinding): string => {
    const tableSignature = `\`[${signature.join(", ")}]\``;
    if (binding.supplement != null)
      return `Signature ${tableSignature} from Evolu's supplement: ${binding.supplement.reason}`;
    if (binding.correctedResult != null)
      return `Signature ${tableSignature} from SQLite's table, with the result corrected: ${binding.correctedResult.reason}`;
    return `Signature ${tableSignature} from SQLite's table.`;
  };

  const emitVariadic = ({
    name,
    binding,
    params,
    variants,
  }: ResolvedVariadic): Array<string> => {
    const opTypes = variants.flatMap(({ variant }) =>
      variant.opType == null
        ? []
        : [
            ...jsDoc(variant.opType.doc, variant.opType.name),
            `export type ${variant.opType.name} = ${variant.ops.map((op) => `typeof ${op}`).join(" | ")};`,
            "",
          ],
    );
    const shimSignatures = variants.map(
      ({ variant, wasmType, signature }) =>
        `\`${variant.shim}\`, wasm type \`${wasmType}\`, signature \`[${signature.join(", ")}]\``,
    );
    const docEnd = (shimsText: Array<string>) => [
      ...jsDoc(binding.doc, name).slice(0, -1),
      " *",
      ...shimsText,
      " *",
      ` * See ${binding.url}.`,
      " */",
    ];

    const [variant] = variants;
    if (binding.otherOps == null && variant != null)
      return [
        ...opTypes,
        ...docEnd([
          ` * Returns the build's shim ${shimSignatures.join("")}. Its signature comes from Evolu's metadata because SQLite's table omits it.`,
        ]),
        `export const ${name} = (deps: SqliteWasmDep): ((${parameterList(
          [
            ...params,
            { name: "op", ts: variant.opType, wasm: "i", optional: false },
            ...variant.args,
          ],
          { optional: false },
        )}) => SqliteResultCode) =>`,
        `  deps.sqliteWasm.exports.${variant.variant.shim};`,
        "",
      ];

    const argsType = `Sqlite${name
      .replace(/^sqlite3_/u, "")
      .split("_")
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join("")}Args`;
    const leading = params.map((param) => param.name);
    return [
      ...opTypes,
      ...jsDoc(`An option of ${name} and the arguments it takes.`, argsType),
      `export type ${argsType} =`,
      ...variants.map(
        ({ opType, args }) =>
          `  | readonly [${[`op: ${opType}`, parameterList(args, { optional: true })].filter((part) => part !== "").join(", ")}]`,
      ),
      ";",
      "",
      ...docEnd([
        " * Calls the build's shims, whose signatures come from Evolu's metadata because SQLite's table omits them:",
        " *",
        ...shimSignatures.map((shimSignature) => ` * - ${shimSignature}.`),
      ]),
      `export const ${name} = (deps: SqliteWasmDep): ((${[parameterList(params, { optional: false }), `...args: ${argsType}`].filter((part) => part !== "").join(", ")}) => SqliteResultCode) => {`,
      `  const { ${variants.map(({ variant }) => variant.shim).join(", ")} } = deps.sqliteWasm.exports;`,
      `  return (${[...leading, "...args"].join(", ")}) => {`,
      "    switch (args[0]) {",
      ...variants.flatMap(({ variant, args }) => [
        ...variant.ops.map((op) => `      case ${op}:`),
        `        return ${variant.shim}(${[
          ...leading,
          "args[0]",
          ...args.map(
            (arg, index) => `args[${index + 1}]${arg.optional ? " ?? 0" : ""}`,
          ),
        ].join(", ")});`,
      ]),
      "      default:",
      "        // TypeScript rejects other options, but JavaScript and casts can pass",
      "        // them.",
      `        return ${binding.otherOps};`,
      "    }",
      "  };",
      "};",
      "",
    ];
  };

  return [
    "/**",
    " * SQLite's C API as standalone functions: one for every public C function",
    ` * the binary exports, and one for each of the variadic ${variadics
      .map(({ name }) => `{@link ${name}}`)
      .join(", ")
      .replace(/, (?=[^,]*$)/u, " and ")}, which the binary`,
    " * exports only as the build's `sqlite3__wasm_*` shims.",
    " *",
    " * Each function takes {@link SqliteWasmDep} and returns the wasm export",
    " * itself, typed with branded pointers and raw result codes, so a call costs",
    " * no JavaScript wrapper. A variadic function whose options need different",
    " * shims returns a function that passes each option to its shim, as SQLite's",
    " * JavaScript does. Bind once per database, never per row. Strings are C",
    " * string pointers; nothing allocates implicitly. A callback parameter takes",
    " * a function pointer, such as one {@link installWasmFunctions} returns.",
    " *",
    " * Each function's documentation gives its wasm type and its signature in",
    " * the syntax of SQLite's table, where `funcptr:` and the callback's signature",
    " * stand for a callback argument.",
    " *",
    " * Generated by `scripts/generate.mts` from SQLite's own signature table in",
    " * `scripts/upstream/sqlite3-api-glue.c-pp.js` and the metadata in",
    " * `scripts/bindings.mts`, with every wasm type checked against the binary's",
    " * pinned exports. Do not edit.",
    " *",
    " * @module",
    " */",
    "",
    ...imports,
    'import type { SqliteWasmDep, installWasmFunctions } from "./Wasm.ts";',
    "",
    "/**",
    " * The C functions this package binds, and the build's shims of the variadic",
    " * ones, as the wasm exports them.",
    " */",
    "export interface SqliteCExports {",
    ...resolved.map((binding) =>
      binding.overloads.length === 0
        ? `  readonly ${binding.name}: ${functionType(binding.params, binding.result)};`
        : `  readonly ${binding.name}: { ${[...binding.overloads, binding]
            .map(
              ({ params, result }) =>
                `(${parameterList(params, { optional: false })}): ${result};`,
            )
            .join(" ")} };`,
    ),
    ...variants.flatMap(({ variant, params, result, wasmType }) => [
      "",
      ...jsDoc(
        `${variant.shimDoc}\n\nWasm type \`${wasmType}\`.`,
        variant.shim,
        "  ",
      ),
      `  readonly ${variant.shim}: ${functionType(params, result)};`,
    ]),
    "}",
    "",
    ...resolved.flatMap((binding) => [
      ...jsDoc(binding.binding.doc, binding.name).slice(0, -1),
      " *",
      ` * Wasm type \`${binding.wasmType}\`. ${provenance(binding)}`,
      " *",
      ` * See ${binding.binding.url}.`,
      " */",
      `export const ${binding.name} = (deps: SqliteWasmDep): SqliteCExports["${binding.name}"] =>`,
      `  deps.sqliteWasm.exports.${binding.name};`,
      "",
    ]),
    ...variadics.flatMap(emitVariadic),
  ].join("\n");
};

/**
 * Links the first mention of each generated C function in a documentation text,
 * outside code spans, except the documented one.
 */
const linkCNames = (
  text: string,
  names: ReadonlyArray<string>,
  self: string,
): string => {
  const linked = new Set([self]);
  const pattern = new RegExp(
    `(?<![\\w{])(?:${names.toSorted((a, b) => b.length - a.length).join("|")})(?!\\w)`,
    "gu",
  );
  return text
    .split(/(`[^`]*`)/u)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replaceAll(pattern, (name) => {
            if (linked.has(name)) return name;
            linked.add(name);
            return `{@link ${name}}`;
          }),
    )
    .join("");
};

const parseEnumJson = (bytes: Uint8Array): WasmEnumJson =>
  JSON.parse(new TextDecoder().decode(bytes)) as WasmEnumJson;

/**
 * The numeric constants of a group of sqlite3__wasm_enum_json(), without the
 * SQLITE_MAX_* build settings `limits` also holds.
 */
const groupConstants = (
  enumJson: WasmEnumJson,
  group: string,
): ReadonlyArray<readonly [name: string, value: number]> => {
  const values = enumJson[group];
  if (values == null || typeof values !== "object")
    throw new Error(`sqlite3__wasm_enum_json() has no group ${group}`);
  return Object.entries(values as Readonly<Record<string, unknown>>).flatMap(
    ([name, value]): Array<readonly [string, number]> =>
      typeof value === "number" && !name.startsWith("SQLITE_MAX_")
        ? [[name, value]]
        : [],
  );
};

const emitConstants = (pinned: WasmBuild, enumJson: WasmEnumJson): string => {
  const handledGroups = new Set([
    ...constantGroups.map(([group]) => group),
    "blobFinalizers",
    "version",
    "structs",
  ]);
  const unknownGroups = Object.keys(enumJson).filter(
    (group) => !handledGroups.has(group),
  );
  if (unknownGroups.length > 0)
    throw new Error(
      `sqlite3__wasm_enum_json() has groups the generator does not know: ${unknownGroups.join(", ")}`,
    );
  const unknownStructs = enumJson.structs
    .map(({ name }) => name)
    .filter(
      (name) => !layoutStructs.includes(name) && !skippedStructs.has(name),
    );
  if (unknownStructs.length > 0)
    throw new Error(
      `sqlite3__wasm_enum_json() has structs the generator does not know: ${unknownStructs.join(", ")}`,
    );

  const blobFinalizers = new Map(groupConstants(enumJson, "blobFinalizers"));
  const version = enumJson.version as Readonly<Record<string, unknown>>;
  // The string omits nine result codes sqlite3.h defines, and this build
  // returns none of them: nothing in SQLite returns SQLITE_ERROR_RESERVESIZE,
  // SQLITE_ERROR_KEY, SQLITE_IOERR_BADKEY, SQLITE_IOERR_CODEC or
  // SQLITE_CANTOPEN_DIRTYWAL, SQLITE_ERROR_UNABLE and SQLITE_OK_SYMLINK stay
  // inside SQLite, SQLITE_IOERR_IN_PAGE needs the Windows-only SQLITE_USE_SEH,
  // and only RBU, which is not built, returns SQLITE_NOTICE_RBU.
  const resultCodes = groupConstants(enumJson, "resultCodes");
  const union = (constants: ReadonlyArray<readonly [string, number]>) =>
    constants.map(([name]) => `typeof ${name}`).join(" | ");

  const layout = (structName: string): Array<string> => {
    const struct = enumJson.structs.find(({ name }) => name === structName);
    if (struct == null)
      throw new Error(`sqlite3__wasm_enum_json() has no struct ${structName}`);
    return [
      `/** The layout of \`${structName}\` in this wasm build. */`,
      `export const ${structName}_layout = {`,
      `  sizeof: ${struct.sizeof},`,
      "  members: {",
      ...Object.entries(struct.members).map(
        ([member, { offset, signature }]) =>
          `    ${member}: { offset: ${offset}, signature: "${signature}" },`,
      ),
      "  },",
      "} as const;",
      "",
    ];
  };

  return [
    "/**",
    " * SQLite's constants and the facts of one wasm build.",
    " *",
    " * Generated by `scripts/generate.mts` from the string",
    " * `sqlite3__wasm_enum_json()` returns and the binary's exports, pinned in",
    " * `scripts/upstream/sqlite3-wasm-enum.json` and",
    " * `scripts/upstream/sqlite3-wasm-exports.json`. Do not edit.",
    " *",
    " * SQLite's constants never change, but {@link SQLITE_WASM_DEALLOC}, the",
    " * struct layouts and the version belong to the build. The loader fails",
    " * unless the binary it loads has the {@link sqliteWasmBuildHash} of the",
    " * pinned one, so these values always describe the binary that runs.",
    " *",
    " * @module",
    " */",
    "",
    'import type { SqliteFunctionPtr } from "./Pointer.ts";',
    "",
    // A build without a feature, such as the session extension, leaves its
    // group empty.
    ...constantGroups.flatMap(([group, title]) => {
      const constants = groupConstants(enumJson, group);
      return constants.length === 0
        ? []
        : [
            `// ${title}`,
            ...constants.map(
              ([name, value]) => `export const ${name} = ${value};`,
            ),
            "",
          ];
    }),
    "// Destructors for the functions that bind or return text or a blob.",
    `export const SQLITE_STATIC = ${blobFinalizers.get("SQLITE_STATIC")};`,
    `export const SQLITE_TRANSIENT = ${blobFinalizers.get("SQLITE_TRANSIENT")};`,
    "",
    "/**",
    " * The function-table index of `sqlite3_free` in this build. Passed as a",
    " * destructor of text or a blob, it hands the buffer to SQLite, which frees",
    " * it.",
    " */",
    `export const SQLITE_WASM_DEALLOC = ${blobFinalizers.get("SQLITE_WASM_DEALLOC")} as SqliteFunctionPtr;`,
    "",
    "/** The SQLite version of this build. */",
    `export const SQLITE_VERSION = ${JSON.stringify(version.SQLITE_VERSION)};`,
    "",
    "/** The SQLite version number of this build. */",
    `export const SQLITE_VERSION_NUMBER = ${JSON.stringify(version.SQLITE_VERSION_NUMBER)};`,
    "",
    "/** The SQLite check-in of this build. */",
    `export const SQLITE_SOURCE_ID = ${JSON.stringify(version.SQLITE_SOURCE_ID)};`,
    "",
    "/** A primary or extended result code. */",
    `export type SqliteResultCode = ${union(resultCodes)};`,
    "",
    "/**",
    " * A primary result code, the low 8 bits of an extended one. SQLITE_ROW and",
    " * SQLITE_DONE are primary codes too.",
    " */",
    `export type SqlitePrimaryResultCode = ${union(resultCodes.filter(([, value]) => value <= 0xff))};`,
    "",
    "/** A fundamental data type, which sqlite3_column_type returns. */",
    `export type SqliteDataType = ${union(groupConstants(enumJson, "dataTypes"))};`,
    "",
    "/** A file lock level of the VFS xLock and xUnlock methods. */",
    `export type SqliteLockLevel = ${union(groupConstants(enumJson, "flock"))};`,
    "",
    ...layoutStructs.flatMap(layout),
    // The definition buildHash implements.
    "/**",
    " * Identifies the build these constants and the CApi functions describe.",
    " *",
    " * The 32-bit FNV-1a hash (offset basis 0x811c9dc5, prime 0x01000193) of",
    " * these bytes, which a loader reads from the instance and the compiled",
    " * module:",
    " *",
    " * 1. The string `sqlite3__wasm_enum_json()` returns: its UTF-8 bytes",
    " *    including the terminating NUL.",
    " * 2. The name of every export `WebAssembly.Module.exports` lists, in the",
    " *    order `toSorted()` without a comparator gives: for each, its UTF-8",
    " *    bytes followed by a NUL byte.",
    " *",
    " * The string holds SQLite's version and check-in, every constant and the",
    " * struct layouts, and the names include every function and shim the CApi",
    " * module reads. The hash covers neither code nor function types; the",
    " * generator checks every binding's and shim's wasm type against the pinned",
    " * build, and `scripts/generate.mts --verify-build` checks a binary against",
    " * the pins.",
    " */",
    `export const sqliteWasmBuildHash = ${hex(buildHash(pinned))};`,
    "",
  ].join("\n");
};

/** Computes the hash {@link emitConstants} documents as `sqliteWasmBuildHash`. */
const buildHash = ({ enumJson, exports }: WasmBuild): number => {
  const encoder = new TextEncoder();
  const nul = Uint8Array.of(0);
  let hash = fnv1a32(nul, fnv1a32(enumJson));
  for (const name of Object.keys(exports).toSorted()) {
    hash = fnv1a32(nul, fnv1a32(encoder.encode(name), hash));
  }
  return hash;
};

/**
 * Formats the pinned imports or exports JSON: sorted by name, one entry per
 * line.
 */
const pinnedJson = (entries: Readonly<Record<string, unknown>>): string =>
  [
    "{",
    Object.keys(entries)
      .toSorted()
      .map(
        (name) => `  ${JSON.stringify(name)}: ${JSON.stringify(entries[name])}`,
      )
      .join(",\n"),
    "}",
    "",
  ].join("\n");

/** Reads the pins of the package in a directory. */
const readPinnedBuild = (directory: URL): WasmBuild => ({
  enumJson: readFileSync(new URL(enumJsonPath, directory)),
  imports: JSON.parse(
    readFileSync(new URL(importsJsonPath, directory), "utf8"),
  ) as PinnedImports,
  exports: JSON.parse(
    readFileSync(new URL(exportsJsonPath, directory), "utf8"),
  ) as PinnedExports,
});

/** Lists how a binary differs from the pinned enum JSON, imports and exports. */
export const verifyWasmBuild = async (
  bytes: Uint8Array,
): Promise<ReadonlyArray<string>> =>
  compareWasmBuilds(
    readPinnedBuild(packageDirectory),
    await readWasmBuild(bytes),
  );

/** Lists how a build differs from the pinned one. */
export const compareWasmBuilds = (
  pinned: WasmBuild,
  build: WasmBuild,
): ReadonlyArray<string> => {
  const differences: Array<string> = [];

  if (!Buffer.from(build.enumJson).equals(pinned.enumJson))
    differences.push("sqlite3__wasm_enum_json() differs from the pinned one");

  const compare = <T,>(
    entry: "import" | "export",
    pinnedEntries: Readonly<Record<string, T>>,
    actualEntries: Readonly<Record<string, T>>,
    describe: (value: T) => string,
  ): void => {
    const names = new Set([
      ...Object.keys(pinnedEntries),
      ...Object.keys(actualEntries),
    ]);
    for (const name of [...names].toSorted()) {
      const expected = pinnedEntries[name];
      const actual = actualEntries[name];
      if (expected == null && actual != null)
        differences.push(`added ${entry} ${name} ${describe(actual)}`);
      else if (expected != null && actual == null)
        differences.push(`removed ${entry} ${name} ${describe(expected)}`);
      else if (
        expected != null &&
        actual != null &&
        describe(expected) !== describe(actual)
      )
        differences.push(
          `changed ${entry} ${name}: pinned ${describe(expected)}, the binary has ${describe(actual)}`,
        );
    }
  };
  compare(
    "import",
    pinned.imports,
    build.imports,
    ({ kind, type }) => `${kind} ${type}`,
  );
  compare("export", pinned.exports, build.exports, (pinnedExport) =>
    pinnedExport.kind === "function" ? pinnedExport.type : pinnedExport.kind,
  );

  const pinnedHash = buildHash(pinned);
  const actualHash = buildHash(build);
  if (pinnedHash !== actualHash)
    differences.push(
      `build hash ${hex(actualHash)}, pinned ${hex(pinnedHash)}`,
    );
  return differences;
};

/** Reads what the pins hold of a binary. */
export const readWasmBuild = async (bytes: Uint8Array): Promise<WasmBuild> => ({
  enumJson: await readWasmEnumJson(bytes),
  ...readWasmInterface(bytes),
});

/**
 * Reads every import's and export's kind and type from the type, import,
 * function and export sections.
 */
export const readWasmInterface = (
  bytes: Uint8Array,
): Pick<WasmBuild, "imports" | "exports"> => {
  const valueTypes: Readonly<Record<number, string>> = {
    0x7f: "i",
    0x7e: "j",
    0x7d: "f",
    0x7c: "d",
  };
  const exportKinds = ["function", "table", "memory", "global", "tag"] as const;
  const types: Array<string> = [];
  const imports: Record<string, PinnedImport> = {};
  // The type index of every function, imported ones first.
  const functionTypes: Array<number> = [];
  const exportEntries: Array<
    readonly [
      name: string,
      kind: (typeof exportKinds)[number] | undefined,
      index: number,
    ]
  > = [];
  let position = 8;

  const byte = (): number => {
    const value = bytes[position++];
    if (value == null) throw new Error("Truncated wasm");
    return value;
  };
  const u32 = (): number => {
    let result = 0;
    let shift = 0;
    let value: number;
    do {
      value = byte();
      result |= (value & 0x7f) << shift;
      shift += 7;
    } while (value & 0x80);
    return result >>> 0;
  };
  const name = (): string => {
    const length = u32();
    const text = new TextDecoder().decode(
      bytes.subarray(position, position + length),
    );
    position += length;
    return text;
  };
  const valueType = (): string => {
    const code = byte();
    const type = valueTypes[code];
    if (type == null)
      throw new Error(`Unsupported wasm value type 0x${code.toString(16)}`);
    return type;
  };
  const limits = (): string => {
    const flags = u32();
    const minimum = u32();
    const range = flags & 1 ? `${minimum}-${u32()}` : `${minimum}`;
    return flags & ~1 ? `${range} flags ${flags}` : range;
  };
  const typeAt = (typeIndex: number): string => {
    const type = types[typeIndex];
    if (type == null) throw new Error(`No wasm type ${typeIndex}`);
    return type;
  };

  while (position < bytes.length) {
    const sectionId = byte();
    const sectionEnd = u32() + position;
    if (sectionId === 1) {
      for (let count = u32(); count > 0; count--) {
        const form = byte();
        if (form !== 0x60)
          throw new Error(`Unsupported wasm type form 0x${form.toString(16)}`);
        let params = "";
        for (let n = u32(); n > 0; n--) params += valueType();
        let results = "";
        for (let n = u32(); n > 0; n--) results += valueType();
        types.push(`${results || "v"}(${params})`);
      }
    } else if (sectionId === 2) {
      for (let count = u32(); count > 0; count--) {
        const moduleName = name();
        const key = `${moduleName}.${name()}`;
        const kind = byte();
        if (kind === 0) {
          const typeIndex = u32();
          functionTypes.push(typeIndex);
          imports[key] = { kind: "function", type: typeAt(typeIndex) };
        } else if (kind === 1)
          imports[key] = {
            kind: "table",
            type: `0x${byte().toString(16)} ${limits()}`,
          };
        else if (kind === 2) imports[key] = { kind: "memory", type: limits() };
        else if (kind === 3)
          imports[key] = {
            kind: "global",
            type: `${valueType()}${byte() === 1 ? " mut" : ""}`,
          };
        else if (kind === 4) {
          byte();
          imports[key] = { kind: "tag", type: typeAt(u32()) };
        } else throw new Error(`Unknown import kind ${kind}`);
      }
    } else if (sectionId === 3) {
      for (let count = u32(); count > 0; count--) functionTypes.push(u32());
    } else if (sectionId === 7) {
      for (let count = u32(); count > 0; count--)
        exportEntries.push([name(), exportKinds[byte()], u32()]);
    }
    position = sectionEnd;
  }

  const exports: Record<string, PinnedExport> = {};
  for (const [exportName, kind, index] of exportEntries) {
    if (kind == null) throw new Error(`${exportName}: unknown export kind`);
    if (kind !== "function") {
      exports[exportName] = { kind };
      continue;
    }
    const typeIndex = functionTypes[index];
    const type = typeIndex == null ? undefined : types[typeIndex];
    if (type == null) throw new Error(`${exportName}: no function type`);
    exports[exportName] = { kind, type };
  }
  return { imports, exports };
};

/**
 * Instantiates the wasm with inert imports and returns the bytes of the string
 * `sqlite3__wasm_enum_json()` builds, without its NUL, which needs nothing but
 * static constructors.
 */
const readWasmEnumJson = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const module = await WebAssembly.compile(new Uint8Array(bytes));
  const imports: Record<string, Record<string, WebAssembly.ImportValue>> = {};
  // Growable to 2 GiB like the real loader; 256 pages covers the declared
  // minimum of every build so far.
  const memory = new WebAssembly.Memory({ initial: 256, maximum: 32768 });
  for (const entry of WebAssembly.Module.imports(module)) {
    const namespace = (imports[entry.module] ??= {});
    namespace[entry.name] = entry.kind === "memory" ? memory : () => 0;
  }
  const instance = await WebAssembly.instantiate(module, imports);
  const { __wasm_call_ctors: callCtors, sqlite3__wasm_enum_json: enumJson } =
    instance.exports;
  if (typeof callCtors !== "function" || typeof enumJson !== "function")
    throw new Error(
      "The wasm lacks __wasm_call_ctors or sqlite3__wasm_enum_json",
    );
  (callCtors as () => void)();
  const pointer = (enumJson as () => number)();
  if (pointer === 0)
    throw new Error(
      "sqlite3__wasm_enum_json() returned NULL: the JSON outgrew its buffer in sqlite3-wasm.c",
    );
  const heap = new Uint8Array(memory.buffer);
  return heap.slice(pointer, heap.indexOf(0, pointer));
};

const formatTypeScript = async (path: URL, source: string): Promise<string> =>
  format(source, {
    ...(await resolveConfig(path)),
    filepath: path.pathname,
  });

const hex = (value: number): string =>
  `0x${value.toString(16).padStart(8, "0")}`;

const log = (message: string): void => {
  // oxlint-disable-next-line eslint/no-console -- Report CLI results.
  console.log(message);
};

if (import.meta.main)
  process.exitCode = await runGenerateCli(
    process.argv.slice(2),
    packageDirectory,
  );
