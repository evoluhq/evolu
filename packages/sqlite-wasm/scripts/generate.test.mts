import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertRejects,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import createWabt from "wabt";
import type { Binding, VariadicBinding, VariadicVariant } from "./bindings.mts";
import {
  compareWasmBuilds,
  findStaleSources,
  generate,
  parseSignatureTable,
  preprocessCpp,
  readWasmBuild,
  readWasmInterface,
  runGenerateCli,
  type GenerateInputs,
  type GeneratedSources,
  type PinnedExport,
  type PinnedExports,
  type WasmBuild,
} from "./generate.mts";

test("importing generate.mts generates nothing", () => {
  const outputs = ["../src/CApi.ts", "../src/Constants.ts"].map(
    (path) => new URL(path, import.meta.url),
  );
  const readModifiedTimes = () =>
    outputs.map((output) => statSync(output).mtimeMs);
  const before = readModifiedTimes();

  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(new URL("generate.mts", import.meta.url).href)});`,
    ],
    { encoding: "utf8" },
  );

  assertEqual([result.status, result.stderr], [0, ""]);
  assertEqual(readModifiedTimes(), before);
});

describe("generate", () => {
  describe("coverage", () => {
    it("generates both sources for metadata that matches the table and the build", async () => {
      const result = await generate(setupInputs());

      assertOk(result);
      assertTrue(
        includesCode(
          result.value.cApi,
          `export const sqlite3_errcode = (deps: SqliteWasmDep): SqliteCExports["sqlite3_errcode"] => deps.sqliteWasm.exports.sqlite3_errcode;`,
        ),
      );
      assertTrue(
        includesCode(result.value.constants, "export const SQLITE_OK = 0;"),
      );
    });

    it("lists an exported public C function without metadata", async () => {
      await assertProblems(
        setupInputs({ exports: { sqlite3_sleep: fn("i(i)") } }),
        [
          "sqlite3_sleep: exported, but scripts/bindings.mts has no metadata",
          "1 exported C functions lack metadata in scripts/bindings.mts.",
        ],
      );
    });

    it("lists metadata for a function the binary does not export", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_sleep", "int", "int"]'],
          exports: { sqlite3_overload_function: { kind: "global" } },
          bindings: {
            sqlite3_sleep: setupBinding(["ms"]),
            sqlite3_overload_function: setupBinding(["db"], {
              supplement: { signature: ["int", "sqlite3*"], reason: "Test." },
            }),
          },
        }),
        [
          "sqlite3_sleep: not a function the binary exports; remove its metadata",
          "sqlite3_overload_function: not a function the binary exports; remove its metadata",
          "sqlite3_overload_function: a public C name, but the binary exports a global",
        ],
      );
    });

    it("lists a public C name the binary exports as something else", async () => {
      await assertProblems(
        setupInputs({ exports: { sqlite3_version: { kind: "global" } } }),
        ["sqlite3_version: a public C name, but the binary exports a global"],
      );
    });

    it("lists every problem rather than only the first", async () => {
      await assertProblems(
        setupInputs({
          exports: { sqlite3_sleep: fn("i(i)"), sqlite3_errcode: fn("i()") },
          bindings: { sqlite3_libversion: setupBinding(["extra"]) },
        }),
        [
          "sqlite3_libversion: 1 parameter names for 0 arguments",
          "sqlite3_errcode: the signature gives wasm type i(i), but the binary exports i()",
          "sqlite3_sleep: exported, but scripts/bindings.mts has no metadata",
          "1 exported C functions lack metadata in scripts/bindings.mts.",
        ],
      );
    });
  });

  describe("public names", () => {
    it("requires no metadata for exports that are not public C API", async () => {
      const result = await generate(
        setupInputs({
          exports: {
            sqlite3__wasm_db_reset: fn("i(i)"),
            malloc: fn("i(i)"),
            _emscripten_stack_alloc: fn("i(i)"),
            __indirect_function_table: { kind: "table" },
            memory: { kind: "memory" },
          },
        }),
      );

      assertOk(result);
    });

    it("requires metadata for session extension functions", async () => {
      await assertProblems(
        setupInputs({
          exports: {
            sqlite3session_create: fn("i(iii)"),
            sqlite3changeset_start: fn("i(iii)"),
            sqlite3changegroup_new: fn("i(i)"),
          },
        }),
        [
          "sqlite3session_create: exported, but scripts/bindings.mts has no metadata",
          "sqlite3changeset_start: exported, but scripts/bindings.mts has no metadata",
          "sqlite3changegroup_new: exported, but scripts/bindings.mts has no metadata",
          "3 exported C functions lack metadata in scripts/bindings.mts.",
        ],
      );
    });

    it("lists metadata for a name that is not public C API", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3__wasm_db_reset", "int", "sqlite3*"]'],
          exports: { sqlite3__wasm_db_reset: fn("i(i)") },
          bindings: { sqlite3__wasm_db_reset: setupBinding(["db"]) },
        }),
        [
          "sqlite3__wasm_db_reset: not a public C function; remove its metadata",
        ],
      );
    });
  });

  describe("supplements and corrections", () => {
    it("lists a function SQLite's table lacks that has no supplement", async () => {
      await assertProblems(
        setupInputs({
          exports: { sqlite3_reset_auto_extension: fn("v()") },
          bindings: { sqlite3_reset_auto_extension: setupBinding([]) },
        }),
        [
          "sqlite3_reset_auto_extension: not in SQLite's table; add a supplement",
        ],
      );
    });

    it("takes the signature of a function the table lacks from its supplement", async () => {
      const result = await generate(
        setupInputs({
          exports: { sqlite3_auto_extension: fn("i(i)") },
          bindings: {
            sqlite3_auto_extension: setupBinding(["xEntryPoint"], {
              supplement: {
                signature: ["int", "funcptr:i(ppp)"],
                reason: "SQLite binds it by hand.",
              },
            }),
          },
        }),
      );

      assertOk(result);
      assertTrue(
        includesCode(
          result.value.cApi,
          "readonly sqlite3_auto_extension: (xEntryPoint: SqliteFunctionPtr) => number;",
        ),
      );
      assertTrue(
        includesCode(
          result.value.cApi,
          'Wasm type `i(i)`. Signature `["sqlite3_auto_extension", "int", "funcptr:i(ppp)"]` from Evolu\'s supplement: SQLite binds it by hand.',
        ),
      );
    });

    it("lists a supplement of a function SQLite's table now has", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_sleep", "int", "int"]'],
          exports: { sqlite3_sleep: fn("i(i)") },
          bindings: {
            sqlite3_sleep: setupBinding(["ms"], {
              supplement: { signature: ["int", "int"], reason: "Test." },
            }),
          },
        }),
        ["sqlite3_sleep: SQLite's table now has it; remove the supplement"],
      );
    });

    it("corrects the result type the table gets wrong", async () => {
      const result = await generate(
        setupInputs({
          table: ['["sqlite3_initialize", undefined]'],
          exports: { sqlite3_initialize: fn("i()") },
          bindings: {
            sqlite3_initialize: setupBinding([], {
              correctedResult: {
                type: "int",
                reason: "The C function returns a result code.",
              },
            }),
          },
        }),
      );

      assertOk(result);
      assertTrue(
        includesCode(
          result.value.cApi,
          "readonly sqlite3_initialize: () => number;",
        ),
      );
      assertTrue(
        includesCode(
          result.value.cApi,
          'Wasm type `i()`. Signature `["sqlite3_initialize", undefined]` from SQLite\'s table, with the result corrected: The C function returns a result code.',
        ),
      );
    });

    it("lists a correction the table now agrees with", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_initialize", "int"]'],
          exports: { sqlite3_initialize: fn("i()") },
          bindings: {
            sqlite3_initialize: setupBinding([], {
              correctedResult: { type: "int", reason: "Test." },
            }),
          },
        }),
        [
          "sqlite3_initialize: SQLite's table now agrees; remove the correction",
        ],
      );
    });
  });

  describe("types", () => {
    it("lists a wasm type that differs from the export", async () => {
      await assertProblems(
        setupInputs({ exports: { sqlite3_errcode: fn("i(ii)") } }),
        [
          "sqlite3_errcode: the signature gives wasm type i(i), but the binary exports i(ii)",
        ],
      );
    });

    it("lists a shim whose wasm type differs from its export", async () => {
      await assertProblems(
        setupInputs({
          exports: { ...variadicExports, sqlite3__wasm_txn_i: fn("i(iij)") },
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
        [
          "sqlite3_txn_config (sqlite3__wasm_txn_i): the signature gives wasm type i(iii), but the binary exports i(iij)",
        ],
      );
    });

    it("lists parameter names that do not match the arguments", async () => {
      await assertProblems(
        setupInputs({
          bindings: { sqlite3_errcode: setupBinding(["db", "extra"]) },
        }),
        ["sqlite3_errcode: 2 parameter names for 1 arguments"],
      );
    });

    it("lists a table type the generator does not map", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_blob_bytes", "int", "sqlite3_blob*"]'],
          exports: { sqlite3_blob_bytes: fn("i(i)") },
          bindings: { sqlite3_blob_bytes: setupBinding(["pBlob"]) },
        }),
        ["sqlite3_blob_bytes: unsupported table type sqlite3_blob*"],
      );
    });

    it("lists a table argument the generator cannot read", async () => {
      await assertProblems(
        setupInputs({
          table: [
            '["sqlite3_busy_handler", "int", ["sqlite3*", new wasm.xWrap.FuncPtrAdapter({ name: "xBusy" }), "*"]]',
          ],
          exports: { sqlite3_busy_handler: fn("i(iii)") },
          bindings: {
            sqlite3_busy_handler: setupBinding(["db", "xBusy", "pArg"]),
          },
        }),
        [
          'sqlite3_busy_handler: unsupported table argument new wasm.xWrap.FuncPtrAdapter({ name: "xBusy" })',
        ],
      );
    });

    it("lists a narrowing to a type the generator does not know", async () => {
      await assertProblems(
        setupInputs({
          bindings: {
            sqlite3_libversion: setupBinding([], { result: "SqliteVersion" }),
            sqlite3_errcode: setupBinding(["db: SqliteBlobPtr"]),
          },
        }),
        [
          "sqlite3_libversion: result: unknown type SqliteVersion",
          "sqlite3_errcode: parameter db: unknown type SqliteBlobPtr",
        ],
      );
    });

    it("lists a narrowing to a type of another wasm value type", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_soft_heap_limit64", "i64", "i64"]'],
          exports: { sqlite3_soft_heap_limit64: fn("j(j)") },
          bindings: {
            sqlite3_soft_heap_limit64: setupBinding(["N: WasmPtr"]),
          },
        }),
        ["sqlite3_soft_heap_limit64: parameter N: WasmPtr is not a wasm j"],
      );
    });

    it("accepts an integer literal type only for a wasm i value", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_soft_heap_limit64", "i64", "i64"]'],
          exports: { sqlite3_soft_heap_limit64: fn("j(j)") },
          bindings: {
            sqlite3_errcode: setupBinding(["db: 0 | SqliteDbPtr"]),
            sqlite3_soft_heap_limit64: setupBinding(["N: 0"]),
          },
        }),
        ["sqlite3_soft_heap_limit64: parameter N: unknown type 0"],
      );
    });

    it("lists an optional parameter of a function that is not variadic", async () => {
      await assertProblems(
        setupInputs({ bindings: { sqlite3_errcode: setupBinding(["db?"]) } }),
        [
          "sqlite3_errcode: only a variadic function's shim arguments can be optional",
        ],
      );
    });
  });

  describe("overloads", () => {
    it("emits overloads before the signature params and result give", async () => {
      const result = await generate(
        setupSerializeInputs([
          "db",
          "zSchema: CStringPtr | NullPtr",
          "mFlags: 0",
        ]),
      );

      assertOk(result);
      assertTrue(
        includesCode(
          result.value.cApi,
          `readonly sqlite3_serialize: {
            (db: SqliteDbPtr, zSchema: CStringPtr | NullPtr, mFlags: 0): SqliteOwnedPtr | NullPtr;
            (db: SqliteDbPtr, zSchema: CStringPtr | NullPtr, mFlags: number): WasmPtr | NullPtr;
          };`,
        ),
      );
    });

    it("checks each overload against the table and the export", async () => {
      await assertProblems(setupSerializeInputs(["db", "mFlags: 0"]), [
        "sqlite3_serialize: 2 parameter names for 3 arguments",
      ]);
    });

    it("lists an optional parameter of an overload", async () => {
      await assertProblems(
        setupSerializeInputs([
          "db",
          "zSchema: CStringPtr | NullPtr",
          "mFlags?",
        ]),
        [
          "sqlite3_serialize: only a variadic function's shim arguments can be optional",
        ],
      );
    });
  });

  describe("variadic functions", () => {
    it("dispatches each option to its shim and returns otherOps for any other", async () => {
      const result = await generate(
        setupInputs({
          exports: variadicExports,
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
      );

      assertOk(result);
      assertTrue(
        includesCode(
          result.value.cApi,
          `export type SqliteTxnConfigArgs =
            | readonly [op: typeof SQLITE_TXN_READ, value: number]
            | readonly [op: typeof SQLITE_TXN_WRITE, value: number, pResult?: WasmPtr | NullPtr];`,
        ),
      );
      assertTrue(
        includesCode(
          result.value.cApi,
          `return (db, ...args) => {
            switch (args[0]) {
              case SQLITE_TXN_READ:
                return sqlite3__wasm_txn_i(db, args[0], args[1]);
              case SQLITE_TXN_WRITE:
                return sqlite3__wasm_txn_ip(db, args[0], args[1], args[2] ?? 0);
              default:`,
        ),
      );
      assertTrue(includesCode(result.value.cApi, "return SQLITE_MISUSE;"));
    });

    it("leaves other options to the binding's doc and comments the default branch truthfully for any shim", async () => {
      const result = await generate(
        setupInputs({
          exports: variadicExports,
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
      );

      assertOk(result);
      // The binding's doc says what other options return and why; the shims of
      // some bindings check the option themselves, and those of others do not.
      assertFalse(result.value.cApi.includes("Any other option"));
      assertTrue(
        includesCode(
          result.value.cApi,
          `default:
            // TypeScript rejects other options, but JavaScript and casts can pass
            // them.
            return SQLITE_MISUSE;`,
        ),
      );
    });

    it("returns the shim itself for one variant without otherOps", async () => {
      const result = await generate(
        setupInputs({
          exports: variadicExports,
          variadicBindings: {
            sqlite3_txn_config: setupShimVariadic(),
          },
        }),
      );

      assertOk(result);
      assertTrue(
        includesCode(
          result.value.cApi,
          `export const sqlite3_txn_config = (deps: SqliteWasmDep): ((db: SqliteDbPtr, op: SqliteTxnOp, value: number) => SqliteResultCode) => deps.sqliteWasm.exports.sqlite3__wasm_txn_i;`,
        ),
      );
    });

    it("lists a variadic function the binary now exports", async () => {
      await assertProblems(
        setupInputs({
          exports: { ...variadicExports, sqlite3_txn_config: fn("i(iii)") },
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
        [
          "sqlite3_txn_config: the binary exports it now; move its metadata to bindings",
          "sqlite3_txn_config: exported, but scripts/bindings.mts has no metadata",
          "1 exported C functions lack metadata in scripts/bindings.mts.",
        ],
      );
    });

    it("lists a function both bindings and variadicBindings have", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3_txn_config", "int", "sqlite3*", "int"]'],
          exports: variadicExports,
          bindings: { sqlite3_txn_config: setupBinding(["db", "op"]) },
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
        [
          "sqlite3_txn_config: not a function the binary exports; remove its metadata",
          "sqlite3_txn_config: both bindings and variadicBindings have it",
        ],
      );
    });

    it("lists more than one variant without otherOps", async () => {
      const { otherOps: _otherOps, ...withoutOtherOps } = setupVariadic();

      await assertVariadicProblem(
        withoutOtherOps,
        "sqlite3_txn_config: more than one variant needs otherOps",
      );
    });

    it("lists an otherOps the build has no constant for", async () => {
      await assertVariadicProblem(
        setupVariadic({ otherOps: "SQLITE_NOPE" }),
        "sqlite3_txn_config: otherOps: the build has no constant SQLITE_NOPE",
      );
    });

    it("lists a shim the binary does not export", async () => {
      await assertProblems(
        setupInputs({
          exports: { sqlite3__wasm_txn_i: fn("i(iii)") },
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
        [
          "sqlite3_txn_config (sqlite3__wasm_txn_ip): not a function the binary exports",
        ],
      );
    });

    it("lists a shim whose signature SQLite's table now has differently", async () => {
      await assertProblems(
        setupInputs({
          table: ['["sqlite3__wasm_txn_i", "int", "sqlite3*", "int", "i64"]'],
          exports: variadicExports,
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
        [
          `sqlite3_txn_config (sqlite3__wasm_txn_i): SQLite's table now has the signature {"result":"int","args":["sqlite3*","int","i64"]}; use it`,
        ],
      );
    });

    it("accepts a shim whose signature SQLite's table has identically", async () => {
      const result = await generate(
        setupInputs({
          table: ['["sqlite3__wasm_txn_i", "int", "sqlite3*", "int", "int"]'],
          exports: variadicExports,
          variadicBindings: { sqlite3_txn_config: setupVariadic() },
        }),
      );

      assertOk(result);
    });

    it("lists an option that is not an int after the parameters", async () => {
      await assertProblems(
        setupInputs({
          exports: { ...variadicExports, sqlite3__wasm_txn_i: fn("i(iji)") },
          variadicBindings: {
            sqlite3_txn_config: setupVariadic({
              variants: [
                { ...intVariant, signature: ["int", "sqlite3*", "i64", "int"] },
                intPointerVariant,
              ],
            }),
          },
        }),
        [
          "sqlite3_txn_config (sqlite3__wasm_txn_i): the option must be an int argument after params",
        ],
      );
    });

    it("lists an optional argument before the last", async () => {
      await assertVariadicProblem(
        setupVariadic({
          variants: [
            intVariant,
            { ...intPointerVariant, args: ["value?", "pResult?"] },
          ],
        }),
        "sqlite3_txn_config (sqlite3__wasm_txn_ip): only the last argument can be optional",
      );
    });

    it("lists an optional argument of a function that is its shim", async () => {
      await assertVariadicProblem(
        setupShimVariadic({ args: ["value?"] }),
        "sqlite3_txn_config (sqlite3__wasm_txn_i): a function that is its shim cannot omit an argument",
      );
    });

    it("lists an option the build has no constant for", async () => {
      await assertVariadicProblem(
        setupVariadic({
          variants: [
            { ...intVariant, ops: ["SQLITE_TXN_NOPE"] },
            intPointerVariant,
          ],
        }),
        "sqlite3_txn_config (sqlite3__wasm_txn_i): the build has no constant SQLITE_TXN_NOPE",
      );
    });

    it("lists an option without the function's prefix", async () => {
      await assertVariadicProblem(
        setupVariadic({
          variants: [{ ...intVariant, ops: ["SQLITE_OK"] }, intPointerVariant],
        }),
        "sqlite3_txn_config (sqlite3__wasm_txn_i): SQLITE_OK lacks the prefix SQLITE_TXN_",
      );
    });

    it("lists an option more than one variant takes", async () => {
      await assertVariadicProblem(
        setupVariadic({
          variants: [
            intVariant,
            {
              ...intPointerVariant,
              ops: ["SQLITE_TXN_WRITE", "SQLITE_TXN_READ"],
              opType: { name: "SqliteTxnOp", doc: "An option." },
            },
          ],
        }),
        "sqlite3_txn_config (sqlite3__wasm_txn_ip): SQLITE_TXN_READ is listed more than once",
      );
    });

    it("lists a variant of several options without an opType", async () => {
      await assertVariadicProblem(
        setupVariadic({
          unsupportedOps: [],
          variants: [
            { ...intVariant, ops: ["SQLITE_TXN_READ", "SQLITE_TXN_NONE"] },
            intPointerVariant,
          ],
        }),
        "sqlite3_txn_config (sqlite3__wasm_txn_i): more than one option needs an opType",
      );
    });

    it("lists an unsupported option the build has no constant for", async () => {
      await assertVariadicProblem(
        setupVariadic({
          unsupportedOps: ["SQLITE_TXN_NONE", "SQLITE_TXN_NOPE"],
        }),
        "sqlite3_txn_config: unsupportedOps: the build has no constant SQLITE_TXN_NOPE",
      );
    });

    it("lists an unsupported option without the function's prefix", async () => {
      await assertVariadicProblem(
        setupVariadic({ unsupportedOps: ["SQLITE_TXN_NONE", "SQLITE_OK"] }),
        "sqlite3_txn_config: unsupportedOps: SQLITE_OK lacks the prefix SQLITE_TXN_",
      );
    });

    it("lists an unsupported option a variant takes", async () => {
      await assertVariadicProblem(
        setupVariadic({
          unsupportedOps: ["SQLITE_TXN_NONE", "SQLITE_TXN_READ"],
        }),
        "sqlite3_txn_config: unsupportedOps: a variant takes SQLITE_TXN_READ",
      );
    });

    it("lists an unsupported option listed more than once", async () => {
      await assertVariadicProblem(
        setupVariadic({
          unsupportedOps: ["SQLITE_TXN_NONE", "SQLITE_TXN_NONE"],
        }),
        "sqlite3_txn_config: unsupportedOps: SQLITE_TXN_NONE is listed more than once",
      );
    });

    it("lists options neither a variant nor unsupportedOps lists", async () => {
      await assertVariadicProblem(
        setupVariadic({ unsupportedOps: [] }),
        "sqlite3_txn_config: options neither a variant nor unsupportedOps lists: SQLITE_TXN_NONE; check how SQLite's JavaScript and the build's shims dispatch them",
      );
    });

    it("lists variants that disagree on the parameters before the option", async () => {
      await assertVariadicProblem(
        setupVariadic({
          variants: [
            intVariant,
            {
              ...intPointerVariant,
              signature: ["int", "sqlite3_stmt*", "int", "int", "int*"],
            },
          ],
        }),
        "sqlite3_txn_config: the variants disagree on the parameters before the option",
      );
    });
  });

  describe("glue", () => {
    it("preprocesses the glue without enable-see, because the build has no SEE", async () => {
      const result = await generate(
        setupInputs({
          table: [
            '["sqlite3_libversion_number", "int"]',
            "//#if enable-see",
            '["sqlite3_libversion_number", "int"]',
            "//#/if",
          ],
          exports: { sqlite3_libversion_number: fn("i()") },
          bindings: { sqlite3_libversion_number: setupBinding([]) },
        }),
      );

      assertOk(result);
    });

    it("fails on a table with more than one entry for a bound function", async () => {
      await assertGenerateRejects(
        setupInputs({ table: ['["sqlite3_errcode", "int", "sqlite3*"]'] }),
        "sqlite3_errcode: SQLite's table has more than one entry",
      );
    });
  });

  describe("constants", () => {
    it("types SqliteResultCode as exactly the result codes the enum JSON lists", async () => {
      const { constants } = await setupSources();

      assertEqual(
        typeMembers(constants, "SqliteResultCode"),
        Object.keys(pinnedEnum.resultCodes),
      );
    });

    it("skips the SQLITE_MAX_* build settings of the limits group", async () => {
      const { constants } = await setupSources();

      assertTrue(includesCode(constants, "export const SQLITE_LIMIT_LENGTH ="));
      assertFalse(constants.includes("SQLITE_MAX_"));
    });

    it("omits a group the build leaves empty, such as the session extension's", async () => {
      const { constants } = await setupSources();

      assertEqual(pinnedEnum.session, {});
      assertFalse(constants.includes("sqlite3session_config"));
      assertTrue(includesCode(constants, "// Fundamental data types."));
    });

    it("fails on an enum JSON without a group the generator emits", async () => {
      const { txnState: _txnState, ...withoutTxnState } = pinnedEnum;

      await assertGenerateRejects(
        setupInputs({ enumJson: encodeEnumJson(withoutTxnState) }),
        "sqlite3__wasm_enum_json() has no group txnState",
      );
    });

    it("fails on an enum JSON group the generator does not know", async () => {
      await assertGenerateRejects(
        setupInputs({
          enumJson: encodeEnumJson({
            ...pinnedEnum,
            blobApi: { SQLITE_BLOB_FOO: 1 },
          }),
        }),
        "sqlite3__wasm_enum_json() has groups the generator does not know: blobApi",
      );
    });

    it("fails on an enum JSON struct the generator does not know", async () => {
      await assertGenerateRejects(
        setupInputs({
          enumJson: encodeEnumJson({
            ...pinnedEnum,
            structs: [
              ...pinnedEnum.structs,
              { name: "sqlite3_blob_methods", sizeof: 4, members: {} },
            ],
          }),
        }),
        "sqlite3__wasm_enum_json() has structs the generator does not know: sqlite3_blob_methods",
      );
    });

    it("fails on an enum JSON without a struct the generator lays out", async () => {
      await assertGenerateRejects(
        setupInputs({
          enumJson: encodeEnumJson({
            ...pinnedEnum,
            structs: pinnedEnum.structs.filter(
              ({ name }) => name !== "sqlite3_vfs",
            ),
          }),
        }),
        "sqlite3__wasm_enum_json() has no struct sqlite3_vfs",
      );
    });

    it("pins the documented build hash of the enum JSON and the export names", async () => {
      const inputs = setupInputs();
      const { constants } = await setupSources(inputs);

      assertTrue(
        includesCode(
          constants,
          `export const sqliteWasmBuildHash = ${hex(documentedBuildHash(inputs.pinned))};`,
        ),
      );
    });
  });
});

describe("parseSignatureTable", () => {
  it("reads the object literal and every push, ignoring the conditions around them", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          ["sqlite3_a", "int", "sqlite3*"],
          ["sqlite3_b", undefined, ["sqlite3_stmt*", "int"]],
        ],
        int64: [],
      };
      if (wasm.bigIntEnabled) {
        bindingSignatures.int64.push(["sqlite3_c", "i64", "sqlite3*"]);
      }`,
      [],
    );

    assertEqual(
      [...table],
      [
        ["sqlite3_a", { result: "int", args: ["sqlite3*"] }],
        ["sqlite3_b", { result: "void", args: ["sqlite3_stmt*", "int"] }],
        ["sqlite3_c", { result: "i64", args: ["sqlite3*"] }],
      ],
    );
  });

  it("reads a callback's signature from FuncPtrAdapter options, also spread or concatenated", () => {
    const table = parseSignatureTable(
      `const __ipsProxy = { signature: 'i(ps)', callProxy: (callback) => callback };
      const bindingSignatures = {
        core: [
          ["sqlite3_a", "int", [
            new wasm.xWrap.FuncPtrAdapter({ name: 'x', signature: 'i(pi)' }),
            new wasm.xWrap.FuncPtrAdapter({ name: 'y', ...__ipsProxy }),
            new wasm.xWrap.FuncPtrAdapter({ signature: "i(pi" + "ssss)" }),
            new wasm.xWrap.FuncPtrAdapter({ signature: 'v(p)', ...__ipsProxy }),
            new wasm.xWrap.FuncPtrAdapter({ ...__ipsProxy, signature: 'v(p)' }),
          ]],
        ],
      };`,
      [],
    );

    assertEqual(table.get("sqlite3_a")?.args, [
      "funcptr:i(pi)",
      "funcptr:i(ps)",
      "funcptr:i(pissss)",
      "funcptr:i(ps)",
      "funcptr:v(p)",
    ]);
  });

  it("takes the branch of a constant condition", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          ["sqlite3_a", undefined, [
            true ? "*" : new wasm.xWrap.FuncPtrAdapter({ signature: 'v(p)' }),
            false ? "*" : new wasm.xWrap.FuncPtrAdapter({ signature: 'v(p)' }),
          ]],
        ],
      };`,
      [],
    );

    assertEqual(table.get("sqlite3_a")?.args, ["*", "funcptr:v(p)"]);
  });

  it("keeps the source text of an argument it cannot read", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          ["sqlite3_a", "int", [
            new wasm.xWrap.FuncPtrAdapter({ name: 'x' }),
            adapter,
            unknownCondition ? "*" : "int",
          ]],
        ],
      };`,
      [],
    );

    assertEqual(table.get("sqlite3_a")?.args, [
      { unsupported: "new wasm.xWrap.FuncPtrAdapter({ name: 'x' })" },
      { unsupported: "adapter" },
      { unsupported: 'unknownCondition ? "*" : "int"' },
    ]);
  });

  it("keeps the source text of a FuncPtrAdapter without options in an object literal, and ignores a spread of options it cannot find", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          ["sqlite3_a", "int", [
            new wasm.xWrap.FuncPtrAdapter,
            new wasm.xWrap.FuncPtrAdapter(options),
            new wasm.xWrap.FuncPtrAdapter({ name: 'x', ...unknownOptions }),
            new wasm.xWrap.FuncPtrAdapter({ ...unknownOptions, signature: 'v(p)' }),
          ]],
        ],
      };`,
      [],
    );

    assertEqual(table.get("sqlite3_a")?.args, [
      { unsupported: "new wasm.xWrap.FuncPtrAdapter" },
      { unsupported: "new wasm.xWrap.FuncPtrAdapter(options)" },
      {
        unsupported:
          "new wasm.xWrap.FuncPtrAdapter({ name: 'x', ...unknownOptions })",
      },
      "funcptr:v(p)",
    ]);
  });

  it("skips an element that is not an entry or has no string name or no result, and keeps the source text of a result it cannot read", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          "sqlite3_x",
          [name, "int"],
          ["sqlite3_y"],
          ["sqlite3_a", "int"],
          ["sqlite3_b", resultType, "int"],
        ],
      };`,
      [],
    );

    assertEqual(
      [...table],
      [
        ["sqlite3_a", { result: "int", args: [] }],
        ["sqlite3_b", { result: "resultType", args: ["int"] }],
      ],
    );
  });

  it("reads a signature written as a template literal or in parentheses", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          ["sqlite3_a", "int", [
            new wasm.xWrap.FuncPtrAdapter({ signature: (\`i(p\` + "i)") }),
          ]],
        ],
      };`,
      [],
    );

    assertEqual(table.get("sqlite3_a")?.args, ["funcptr:i(pi)"]);
  });

  it("keeps the source text of a callback whose signature is not a string", () => {
    const table = parseSignatureTable(
      `const bindingSignatures = {
        core: [
          ["sqlite3_a", "int", [
            new wasm.xWrap.FuncPtrAdapter({ signature: "i(" + suffix }),
          ]],
        ],
      };`,
      [],
    );

    assertEqual(table.get("sqlite3_a")?.args, [
      {
        unsupported:
          'new wasm.xWrap.FuncPtrAdapter({ signature: "i(" + suffix })',
      },
    ]);
  });

  it("fails on more than one entry for a bound name only", () => {
    const source = `const bindingSignatures = {
      core: [
        ["sqlite3_a", "int"],
        ["sqlite3_a", "int"],
        ["sqlite3_b", "int"],
      ],
    };`;

    assertEqual(parseSignatureTable(source, ["sqlite3_b"]).size, 2);
    assertThrowsWithMessage(
      () => parseSignatureTable(source, ["sqlite3_b", "sqlite3_a"]),
      "sqlite3_a: SQLite's table has more than one entry",
    );
  });

  it("fails on a source without entries", () => {
    assertThrowsWithMessage(
      () =>
        parseSignatureTable(
          'const bindingSignatures = { core: [] }; bindings.core.push(["sqlite3_a", "int"]);',
          [],
        ),
      "No bindingSignatures entries found",
    );
  });
});

describe("preprocessCpp", () => {
  it("keeps the lines of active branches and blanks every other line", () => {
    const source = [
      "a",
      "//#define x 1",
      "//#if x",
      "b",
      "//#if not y",
      "c",
      "//#else",
      "d",
      "//#/if",
      "//#else",
      "e",
      "//#/if",
      "  //#if y",
      "f",
      "//#define z",
      "//#/if",
      "//#if z",
      "g",
      "//#/if",
    ].join("\n");

    assertEqual(preprocessCpp(source, new Set()).split("\n"), [
      "a",
      "",
      "",
      "b",
      "",
      "c",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    assertEqual(preprocessCpp("//#if y\nf\n//#/if", new Set(["y"])), "\nf\n");
  });

  it("fails on a directive the generator does not run", () => {
    assertThrowsWithMessage(
      () => preprocessCpp("a\n//#include other.js", new Set()),
      "sqlite3-api-glue.c-pp.js:2: unsupported directive //#include",
    );
  });

  it("fails on a condition other than one symbol", () => {
    assertThrowsWithMessage(
      () => preprocessCpp("//#if x and y\n//#/if", new Set()),
      "sqlite3-api-glue.c-pp.js:1: unsupported condition x and y",
    );
  });

  it("fails on //#else without //#if", () => {
    assertThrowsWithMessage(
      () => preprocessCpp("//#else", new Set()),
      "sqlite3-api-glue.c-pp.js:1: #else without #if",
    );
  });

  it("fails on //#/if without //#if", () => {
    assertThrowsWithMessage(
      () => preprocessCpp("//#if x\n//#/if\n//#/if", new Set()),
      "sqlite3-api-glue.c-pp.js:3: #/if without #if",
    );
  });
});

describe("compareWasmBuilds", () => {
  it("lists nothing for builds with the same enum JSON, imports and exports", () => {
    assertEqual(compareWasmBuilds(smallBuild, { ...smallBuild }), []);
  });

  it("lists an enum JSON that differs", () => {
    const build = { ...smallBuild, enumJson: encode('{"a":2}') };

    assertEqual(compareWasmBuilds(smallBuild, build), [
      "sqlite3__wasm_enum_json() differs from the pinned one",
      buildHashDifference(smallBuild, build),
    ]);
  });

  it("lists added, removed and changed imports", () => {
    const build: WasmBuild = {
      ...smallBuild,
      imports: {
        "env.abort": { kind: "function", type: "v()" },
        "env.memory": { kind: "memory", type: "128-32768" },
      },
    };

    assertEqual(compareWasmBuilds(smallBuild, build), [
      "added import env.abort function v()",
      "removed import env.exit function v(i)",
      "changed import env.memory: pinned memory 256-32768, the binary has memory 128-32768",
    ]);
  });

  it("lists added, removed and changed exports", () => {
    const build: WasmBuild = {
      ...smallBuild,
      exports: {
        memory: { kind: "global" },
        sqlite3_errcode: fn("i(ii)"),
        sqlite3_sleep: fn("i(i)"),
      },
    };

    assertEqual(compareWasmBuilds(smallBuild, build), [
      "changed export memory: pinned memory, the binary has global",
      "changed export sqlite3_errcode: pinned i(i), the binary has i(ii)",
      "removed export sqlite3_libversion i()",
      "added export sqlite3_sleep i(i)",
      buildHashDifference(smallBuild, build),
    ]);
  });

  it("lists a build hash that differs", () => {
    const build: WasmBuild = {
      ...smallBuild,
      exports: { ...smallBuild.exports, sqlite3_sleep: fn("i(i)") },
    };

    assertEqual(compareWasmBuilds(smallBuild, build), [
      "added export sqlite3_sleep i(i)",
      buildHashDifference(smallBuild, build),
    ]);
  });
});

describe("readWasmBuild", () => {
  it("reads the enum JSON without its NUL after running the static constructors", async () => {
    const build = await readWasmBuild(
      await setupWat(`(module
        (import "env" "memory" (memory 1))
        (data (i32.const 16) "X\\"a\\":1}\\00garbage")
        (func (export "__wasm_call_ctors")
          (i32.store8 (i32.const 16) (i32.const 0x7b)))
        (func (export "sqlite3__wasm_enum_json") (result i32) (i32.const 16)))`),
    );

    assertEqual(
      { ...build, enumJson: new TextDecoder().decode(build.enumJson) },
      {
        enumJson: '{"a":1}',
        imports: { "env.memory": { kind: "memory", type: "1" } },
        exports: {
          __wasm_call_ctors: fn("v()"),
          sqlite3__wasm_enum_json: fn("i()"),
        },
      },
    );
  });

  it("runs the static constructors with imports that return 0", async () => {
    const build = await readWasmBuild(
      await setupWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "get" (func $get (result i32)))
        (data (i32.const 16) "X\\"a\\":1}\\00")
        (func (export "__wasm_call_ctors")
          (i32.store8
            (i32.const 16)
            (i32.add (call $get) (i32.const 0x7b))))
        (func (export "sqlite3__wasm_enum_json") (result i32) (i32.const 16)))`),
    );

    assertEqual(new TextDecoder().decode(build.enumJson), '{"a":1}');
  });

  it("fails when sqlite3__wasm_enum_json returns NULL", async () => {
    await assertRejectsWithMessage(
      readWasmBuild(
        await setupWat(`(module
          (import "env" "memory" (memory 1))
          (func (export "__wasm_call_ctors"))
          (func (export "sqlite3__wasm_enum_json") (result i32) (i32.const 0)))`),
      ),
      "sqlite3__wasm_enum_json() returned NULL: the JSON outgrew its buffer in sqlite3-wasm.c",
    );
  });

  it("fails on a wasm without sqlite3__wasm_enum_json", async () => {
    await assertRejectsWithMessage(
      readWasmBuild(
        await setupWat(`(module
          (import "env" "memory" (memory 1))
          (func (export "__wasm_call_ctors")))`),
      ),
      "The wasm lacks __wasm_call_ctors or sqlite3__wasm_enum_json",
    );
  });
});

describe("readWasmInterface", () => {
  it("reads the kind and type of every import and export", async () => {
    const wasm = await setupWat(
      `(module
        (import "env" "f" (func $f (param i32 i64 f32 f64) (result f64)))
        (import "env" "v" (func))
        (import "env" "table" (table 1 10 funcref))
        (import "env" "memory" (memory 1 2 shared))
        (import "env" "g" (global (mut i32)))
        (import "env" "h" (global f64))
        (import "env" "tag" (tag (param i32)))
        (func (export "fn") (param i32) (result i64) (i64.const 0))
        (export "reexported" (func $f))
        (export "memory" (memory 0))
        (table (export "table") 0 funcref)
        (global (export "global") i32 (i32.const 0))
        (tag (export "exportedTag") (param i64)))`,
      { exceptions: true, threads: true },
    );

    assertEqual(readWasmInterface(wasm), {
      imports: {
        "env.f": { kind: "function", type: "d(ijfd)" },
        "env.v": { kind: "function", type: "v()" },
        "env.table": { kind: "table", type: "0x70 1-10" },
        "env.memory": { kind: "memory", type: "1-2 flags 3" },
        "env.g": { kind: "global", type: "i mut" },
        "env.h": { kind: "global", type: "d" },
        "env.tag": { kind: "tag", type: "v(i)" },
      },
      exports: {
        fn: fn("j(i)"),
        reexported: fn("d(ijfd)"),
        memory: { kind: "memory" },
        table: { kind: "table" },
        global: { kind: "global" },
        exportedTag: { kind: "tag" },
      },
    });
  });

  it("fails on a value type it does not map", async () => {
    const wasm = await setupWat(`(module (func (export "f") (param v128)))`, {
      simd: true,
    });

    assertThrowsWithMessage(
      () => readWasmInterface(wasm),
      "Unsupported wasm value type 0x7b",
    );
  });

  it("fails on a type other than a function type", () => {
    // A struct type of the GC proposal, without fields.
    const wasm = setupWasm([[1, [1, 0x5f, 0]]]);

    assertThrowsWithMessage(
      () => readWasmInterface(wasm),
      "Unsupported wasm type form 0x5f",
    );
  });

  it("fails on an import of an unknown kind", () => {
    const wasm = setupWasm([[2, [1, ...wasmName("env"), ...wasmName("x"), 5]]]);

    assertThrowsWithMessage(
      () => readWasmInterface(wasm),
      "Unknown import kind 5",
    );
  });

  it("fails on an export of an unknown kind", () => {
    const wasm = setupWasm([[7, [1, ...wasmName("x"), 5, 0]]]);

    assertThrowsWithMessage(
      () => readWasmInterface(wasm),
      "x: unknown export kind",
    );
  });

  it("fails on an imported function whose type does not exist", () => {
    const wasm = setupWasm([
      [2, [1, ...wasmName("env"), ...wasmName("f"), 0, 3]],
    ]);

    assertThrowsWithMessage(() => readWasmInterface(wasm), "No wasm type 3");
  });

  it("fails on an exported function that does not exist", () => {
    const wasm = setupWasm([[7, [1, ...wasmName("x"), 0, 0]]]);

    assertThrowsWithMessage(
      () => readWasmInterface(wasm),
      "x: no function type",
    );
  });

  it("fails on a truncated section", () => {
    const wasm = setupWasm([[1, [1, 0x60, 1]]]).subarray(0, -1);

    assertThrowsWithMessage(() => readWasmInterface(wasm), "Truncated wasm");
  });
});

describe("findStaleSources", () => {
  it("lists the paths whose content differs", (t) => {
    const directory = setupDirectory(t);
    const fresh = pathToFileURL(join(directory, "Fresh.ts"));
    const stale = pathToFileURL(join(directory, "Stale.ts"));
    writeFileSync(fresh, "export const a = 1;\n");
    writeFileSync(stale, "export const a = 1;\n");

    assertEqual(
      findStaleSources([
        [fresh, "export const a = 1;\n"],
        [stale, "export const a = 2;\n"],
      ]),
      [stale],
    );
  });
});

describe("generate.mts CLI", () => {
  it("--check passes when the outputs are up to date", () => {
    const result = runGenerate(["--check"]);

    assertEqual([result.status, result.stdout, result.stderr], [0, "", ""]);
  });

  it("--verify-build lists how a binary differs from the pins and fails", async (t) => {
    const wasmPath = join(setupDirectory(t), "sqlite3.wasm");
    writeFileSync(
      wasmPath,
      await setupWat(`(module
        (import "env" "memory" (memory 1))
        (data (i32.const 16) "{}")
        (func (export "__wasm_call_ctors"))
        (func (export "sqlite3__wasm_enum_json") (result i32) (i32.const 16)))`),
    );

    const result = runGenerate(["--verify-build", wasmPath]);
    const lines = result.stdout.trimEnd().split("\n");

    assertEqual(result.status, 1);
    assertEqual(
      lines[0],
      "sqlite3__wasm_enum_json() differs from the pinned one",
    );
    assertEqual(
      lines.at(-1),
      `${wasmPath} differs from the pins; pin it with --pin-build.`,
    );
  });
});

describe("runGenerateCli", () => {
  it("--pin-build writes a binary's enum JSON, and its imports and exports sorted by name, one per line, and --verify-build then finds the binary matches the pins", async (t) => {
    const directory = setupPackage(t);
    const logged = setupLog(t);
    const wasm = await setupWat(`(module
      (import "env" "z" (func (param i32) (result i32)))
      (import "env" "memory" (memory 1))
      (data (i32.const 16) "{}")
      (func (export "sqlite3__wasm_enum_json") (result i32) (i32.const 16))
      (func (export "__wasm_call_ctors")))`);
    const wasmPath = join(setupDirectory(t), "sqlite3.wasm");
    writeFileSync(wasmPath, wasm);
    const readPin = (file: string) =>
      readFileSync(new URL(`scripts/upstream/${file}`, directory), "utf8");

    assertEqual(await runGenerateCli(["--pin-build", wasmPath], directory), 0);
    assertEqual(readPin("sqlite3-wasm-enum.json"), "{}");
    assertEqual(
      readPin("sqlite3-wasm-imports.json"),
      [
        "{",
        '  "env.memory": {"kind":"memory","type":"1"},',
        '  "env.z": {"kind":"function","type":"i(i)"}',
        "}",
        "",
      ].join("\n"),
    );
    assertEqual(
      readPin("sqlite3-wasm-exports.json"),
      [
        "{",
        '  "__wasm_call_ctors": {"kind":"function","type":"v()"},',
        '  "sqlite3__wasm_enum_json": {"kind":"function","type":"i()"}',
        "}",
        "",
      ].join("\n"),
    );
    assertEqual(
      await runGenerateCli(["--verify-build", wasmPath], directory),
      0,
    );
    assertEqual(logged(), [
      `Pinned ${wasmPath}, build hash ${hex(documentedBuildHash(await readWasmBuild(wasm)))}. Regenerate with node scripts/generate.mts.`,
      `${wasmPath} matches the pins.`,
    ]);
  });

  it("writes the generated sources, which --check then finds up to date, and --check lists a source that differs and fails without writing it", async (t) => {
    const directory = setupPackage(t);
    const logged = setupLog(t);
    const cApi = new URL("src/CApi.ts", directory);
    const constants = new URL("src/Constants.ts", directory);
    const readSources = () =>
      [cApi, constants].map((source) => readFileSync(source, "utf8"));
    // The copies of the package's sources, which are up to date.
    const generated = readSources();
    writeFileSync(cApi, "stale");
    writeFileSync(constants, "stale");

    assertEqual(await runGenerateCli([], directory), 0);
    assertEqual(readSources(), generated);
    assertEqual(await runGenerateCli(["--check"], directory), 0);
    writeFileSync(constants, "stale");
    assertEqual(await runGenerateCli(["--check"], directory), 1);
    assertEqual(readFileSync(constants, "utf8"), "stale");
    assertEqual(logged(), [
      `${constants.pathname} is stale; run node scripts/generate.mts.`,
    ]);
  });

  it("lists the problems and fails without writing the sources when generation fails", async (t) => {
    const directory = setupPackage(t);
    const logged = setupLog(t);
    const exportsPath = new URL(
      "scripts/upstream/sqlite3-wasm-exports.json",
      directory,
    );
    const { sqlite3_errcode: _errcode, ...exports } = JSON.parse(
      readFileSync(exportsPath, "utf8"),
    ) as PinnedExports;
    writeFileSync(exportsPath, JSON.stringify(exports));
    const sources = ["src/CApi.ts", "src/Constants.ts"].map(
      (path) => new URL(path, directory),
    );
    for (const source of sources) writeFileSync(source, "stale");

    assertEqual(await runGenerateCli([], directory), 1);
    assertEqual(logged(), [
      "sqlite3_errcode: not a function the binary exports; remove its metadata",
    ]);
    assertEqual(
      sources.map((source) => readFileSync(source, "utf8")),
      ["stale", "stale"],
    );
  });
});

/**
 * Creates a package directory with copies of the package's pinned inputs and
 * generated sources.
 */
const setupPackage = (t: TestContext): URL => {
  const directory = pathToFileURL(join(setupDirectory(t), "/"));
  mkdirSync(new URL("scripts/upstream/", directory), { recursive: true });
  mkdirSync(new URL("src/", directory));
  for (const path of [
    "scripts/upstream/sqlite3-api-glue.c-pp.js",
    "scripts/upstream/sqlite3-wasm-enum.json",
    "scripts/upstream/sqlite3-wasm-imports.json",
    "scripts/upstream/sqlite3-wasm-exports.json",
    "src/CApi.ts",
    "src/Constants.ts",
  ])
    copyFileSync(
      new URL(`../${path}`, import.meta.url),
      new URL(path, directory),
    );
  return directory;
};

/**
 * Replaces console.log for the test and returns a function that lists the
 * messages logged.
 */
const setupLog = (t: TestContext) => {
  const log = t.mock.method(console, "log", () => undefined);
  return (): ReadonlyArray<string> =>
    log.mock.calls.map(({ arguments: [message] }) => String(message));
};

const pinnedEnumJson = readFileSync(
  new URL("upstream/sqlite3-wasm-enum.json", import.meta.url),
);

const pinnedEnum = JSON.parse(pinnedEnumJson.toString()) as {
  readonly resultCodes: Readonly<Record<string, number>>;
  readonly structs: ReadonlyArray<{ readonly name: string }>;
  readonly [group: string]: unknown;
};

const encodeEnumJson = (enumJson: object): Uint8Array =>
  encode(JSON.stringify(enumJson));

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const fn = (type: string): PinnedExport => ({ kind: "function", type });

const setupBinding = (
  params: ReadonlyArray<string>,
  binding: Partial<Binding> = {},
): Binding => ({
  doc: "Does something.",
  url: "https://sqlite.org/c3ref/intro.html",
  params,
  ...binding,
});

/**
 * Creates generator inputs with two functions in the table, the build and the
 * metadata, and the pinned enum JSON, plus the given table entries, exports and
 * metadata.
 */
const setupInputs = ({
  table = [],
  exports = {},
  bindings = {},
  variadicBindings = {},
  enumJson = pinnedEnumJson,
}: {
  table?: ReadonlyArray<string>;
  exports?: PinnedExports;
  bindings?: Readonly<Record<string, Binding>>;
  variadicBindings?: Readonly<Record<string, VariadicBinding>>;
  enumJson?: Uint8Array;
} = {}): GenerateInputs => ({
  glue: [
    "const bindingSignatures = {",
    "  core: [",
    '    ["sqlite3_libversion", "string"],',
    '    ["sqlite3_errcode", "int", "sqlite3*"],',
    ...table.map((entry) =>
      entry.startsWith("//#") ? entry : `    ${entry},`,
    ),
    "  ],",
    "};",
  ].join("\n"),
  pinned: {
    enumJson,
    imports: {},
    exports: {
      sqlite3_libversion: fn("i()"),
      sqlite3_errcode: fn("i(i)"),
      ...exports,
    },
  },
  bindings: {
    sqlite3_libversion: setupBinding([]),
    sqlite3_errcode: setupBinding(["db"]),
    ...bindings,
  },
  variadicBindings,
});

const setupSources = async (
  inputs = setupInputs(),
): Promise<GeneratedSources> => {
  const result = await generate(inputs);
  assertOk(result);
  return result.value;
};

/** Creates inputs with a function whose overload takes the given parameters. */
const setupSerializeInputs = (
  overloadParams: ReadonlyArray<string>,
): GenerateInputs =>
  setupInputs({
    table: ['["sqlite3_serialize", "*", "sqlite3*", "string", "int"]'],
    exports: { sqlite3_serialize: fn("i(iii)") },
    bindings: {
      sqlite3_serialize: setupBinding(
        ["db", "zSchema: CStringPtr | NullPtr", "mFlags"],
        {
          result: "WasmPtr | NullPtr",
          overloads: [
            { params: overloadParams, result: "SqliteOwnedPtr | NullPtr" },
          ],
        },
      ),
    },
  });

// The variadic fixture takes SQLITE_TXN_* as its options, because the group is
// small: SQLITE_TXN_NONE, SQLITE_TXN_READ and SQLITE_TXN_WRITE.
const intVariant: VariadicVariant = {
  shim: "sqlite3__wasm_txn_i",
  shimDoc: "Passes an int.",
  signature: ["int", "sqlite3*", "int", "int"],
  args: ["value"],
  ops: ["SQLITE_TXN_READ"],
};

const intPointerVariant: VariadicVariant = {
  shim: "sqlite3__wasm_txn_ip",
  shimDoc: "Passes an int and an int*.",
  signature: ["int", "sqlite3*", "int", "int", "int*"],
  args: ["value", "pResult?: WasmPtr | NullPtr"],
  ops: ["SQLITE_TXN_WRITE"],
};

const variadicExports: PinnedExports = {
  sqlite3__wasm_txn_i: fn("i(iii)"),
  sqlite3__wasm_txn_ip: fn("i(iiii)"),
};

const setupVariadic = (
  variadic: Partial<VariadicBinding> = {},
): VariadicBinding => ({
  doc: "Sets an option of a connection.",
  url: "https://sqlite.org/c3ref/db_config.html",
  params: ["db"],
  opPrefix: "SQLITE_TXN_",
  unsupportedOps: ["SQLITE_TXN_NONE"],
  variants: [intVariant, intPointerVariant],
  otherOps: "SQLITE_MISUSE",
  ...variadic,
});

/** Creates a variadic function that is its single shim. */
const setupShimVariadic = (
  variant: Partial<VariadicVariant> = {},
): VariadicBinding => {
  const { otherOps: _otherOps, ...variadic } = setupVariadic({
    variants: [
      {
        ...intVariant,
        ops: ["SQLITE_TXN_READ", "SQLITE_TXN_WRITE"],
        opType: { name: "SqliteTxnOp", doc: "An option." },
        ...variant,
      },
    ],
  });
  return variadic;
};

const assertProblems = async (
  inputs: GenerateInputs,
  problems: ReadonlyArray<string>,
): Promise<void> => {
  assertErr(await generate(inputs), { type: "GenerateError", problems });
};

const assertVariadicProblem = (
  variadic: VariadicBinding,
  problem: string,
): Promise<void> =>
  assertProblems(
    setupInputs({
      exports: variadicExports,
      variadicBindings: { sqlite3_txn_config: variadic },
    }),
    [problem],
  );

const assertGenerateRejects = (
  inputs: GenerateInputs,
  message: string,
): Promise<void> => assertRejectsWithMessage(generate(inputs), message);

/**
 * Whether the code contains the snippet, ignoring whitespace, trailing commas
 * and the asterisks that start JSDoc lines.
 */
const includesCode = (code: string, snippet: string): boolean => {
  const compact = (text: string) =>
    text
      .replaceAll(/\n\s*\*(?!\/)/gu, "\n")
      .replaceAll(/\s+/gu, "")
      .replaceAll(/,(?=[)\]}])/gu, "");
  return compact(code).includes(compact(snippet));
};

/** The constant names of an exported union of `typeof` constants. */
const typeMembers = (code: string, typeName: string): ReadonlyArray<string> => {
  const union = new RegExp(`export type ${typeName} =([^;]*);`, "u").exec(
    code,
  )?.[1];
  assert(union != null, `No type ${typeName}`);
  return [...union.matchAll(/typeof (\w+)/gu)].map(([, name]) => name ?? "");
};

const smallBuild: WasmBuild = {
  enumJson: encode('{"a":1}'),
  imports: {
    "env.exit": { kind: "function", type: "v(i)" },
    "env.memory": { kind: "memory", type: "256-32768" },
  },
  exports: {
    memory: { kind: "memory" },
    sqlite3_errcode: fn("i(i)"),
    sqlite3_libversion: fn("i()"),
  },
};

/**
 * The build hash as the documentation of `sqliteWasmBuildHash` defines it:
 * 32-bit FNV-1a of the enum JSON and its NUL, then of every export name and a
 * NUL, sorted.
 */
const documentedBuildHash = ({ enumJson, exports }: WasmBuild): number => {
  const nul = Uint8Array.of(0);
  let hash = 0x811c9dc5;
  for (const chunk of [
    enumJson,
    nul,
    ...Object.keys(exports)
      .toSorted()
      .flatMap((name) => [encode(name), nul]),
  ])
    for (const value of chunk) hash = Math.imul(hash ^ value, 0x01000193);
  return hash >>> 0;
};

const hex = (value: number): string =>
  `0x${value.toString(16).padStart(8, "0")}`;

const buildHashDifference = (pinned: WasmBuild, build: WasmBuild): string =>
  `build hash ${hex(documentedBuildHash(build))}, pinned ${hex(documentedBuildHash(pinned))}`;

const setupWat = async (
  wat: string,
  features: Readonly<Record<string, boolean>> = {},
): Promise<Uint8Array> =>
  (await createWabt()).parseWat("test.wat", wat, features).toBinary({}).buffer;

/** Assembles a wasm from sections whose lengths fit in one byte. */
const setupWasm = (
  sections: ReadonlyArray<
    readonly [id: number, content: ReadonlyArray<number>]
  >,
): Uint8Array =>
  Uint8Array.from([
    // The magic number and version 1.
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
    ...sections.flatMap(([id, content]) => [id, content.length, ...content]),
  ]);

const wasmName = (name: string): ReadonlyArray<number> => [
  name.length,
  ...encode(name),
];

const runGenerate = (args: ReadonlyArray<string>) =>
  spawnSync(
    process.execPath,
    [fileURLToPath(new URL("generate.mts", import.meta.url)), ...args],
    { encoding: "utf8" },
  );

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-generate-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

const assertRejectsWithMessage = (
  promise: Promise<unknown>,
  message: string,
): Promise<void> =>
  assertRejects(promise, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });

const assertThrowsWithMessage = (run: () => unknown, message: string): void => {
  assertThrows(run, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });
};
