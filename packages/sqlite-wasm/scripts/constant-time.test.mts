import { assertEqual, assertInstanceOf, assertRejects } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import createWabt from "wabt";
import { readPinnedWasm, wasmPath } from "./check-wasm.mts";
import {
  inspectConstantTime,
  inspectWithSymbolMap,
  renderListing,
  reviewedFunctions,
  runConstantTimeCli,
  type ReviewedFunction,
} from "./constant-time.mts";

describe("inspectConstantTime", () => {
  it("lists every branch, and a load or store only when its address depends on a loaded value", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32 i32) (result i32)
        block
          local.get 0
          i32.const 16
          i32.lt_u
          br_if 0
          local.get 1
          i32.load
          i32.load offset=4
          drop
          local.get 1
          local.get 0
          i32.load
          i32.store
          local.get 0
          i32.load
          i32.const 0
          i32.store8 offset=2
        end
        local.get 0
        local.get 1
        local.get 0
        i32.eqz
        select)`);

    const { functions } = await inspectConstantTime(wasm, [setupFunction(0)]);

    assertEqual(functions[0].findings, [
      {
        at: 5,
        instruction: "br_if 0",
        operand: "condition",
        expression: "i32.lt_u(local 0, 16)",
        dependsOn: [],
      },
      {
        at: 8,
        instruction: "i32.load offset=4",
        operand: "address",
        expression: "#7",
        dependsOn: ["#7"],
      },
      {
        at: 17,
        instruction: "i32.store8 offset=2",
        operand: "address",
        expression: "#15",
        dependsOn: ["#15"],
      },
      {
        at: 23,
        instruction: "select",
        operand: "condition",
        expression: "i32.eqz(local 0)",
        dependsOn: [],
      },
    ]);
    assertEqual(functions[0].sources, [
      { at: 7, instruction: "i32.load", operands: "local 1" },
      { at: 15, instruction: "i32.load", operands: "local 0" },
    ]);
    assertEqual(functions[0].instructions, 23);
  });

  it("lists every if, br_table and call_indirect, and memory operations, global.set and divisions on loaded values", async () => {
    const wasm = await setupWasm(`
      (type $v (func))
      (table 1 funcref)
      (memory 1)
      (global (mut i32) (i32.const 0))
      (func (param i32)
        local.get 0
        if
          nop
        end
        block
          local.get 0
          br_table 0 0
        end
        local.get 0
        i32.load
        call_indirect (type $v)
        local.get 0
        local.get 0
        i32.load
        i32.const 16
        memory.copy
        local.get 0
        i32.const 0
        i32.const 16
        memory.fill
        local.get 0
        local.get 0
        i32.load
        local.get 0
        memory.fill
        local.get 0
        i32.const 0
        local.get 0
        i32.load
        memory.fill
        local.get 0
        i32.load
        global.set 0
        local.get 0
        i32.load
        i32.const 3
        i32.div_u
        local.get 0
        i32.const 3
        i32.rem_s
        i32.add
        drop)`);

    const { functions } = await inspectConstantTime(wasm, [setupFunction(0)]);

    assertEqual(functions[0].findings, [
      {
        at: 2,
        instruction: "if",
        operand: "condition",
        expression: "local 0",
        dependsOn: [],
      },
      {
        at: 7,
        instruction: "br_table 0 0",
        operand: "index",
        expression: "local 0",
        dependsOn: [],
      },
      {
        at: 11,
        instruction: "call_indirect (type 0)",
        operand: "table index",
        expression: "#10",
        dependsOn: ["#10"],
      },
      {
        at: 16,
        instruction: "memory.copy",
        operand: "destination, source and size",
        expression: "local 0, #14, 16",
        dependsOn: ["#14"],
      },
      {
        at: 30,
        instruction: "memory.fill",
        operand: "destination and size",
        expression: "local 0, #29",
        dependsOn: ["#29"],
      },
      {
        at: 33,
        instruction: "global.set 0",
        operand: "value",
        expression: "#32",
        dependsOn: ["#32"],
      },
      {
        at: 37,
        instruction: "i32.div_u",
        operand: "operands",
        expression: "#35, 3",
        dependsOn: ["#35"],
      },
    ]);
  });

  it("follows loaded values through locals, and runs loops until their locals settle", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32) (local i32 i32)
        local.get 0
        i32.load
        local.set 1
        i32.const 0
        local.set 1
        local.get 1
        if
        end
        loop
          local.get 2
          i32.eqz
          br_if 1
          local.get 0
          i32.load
          local.set 2
          local.get 0
          br_if 0
        end)`);

    const { functions } = await inspectConstantTime(wasm, [setupFunction(0)]);

    assertEqual(functions[0].findings, [
      {
        at: 7,
        instruction: "if",
        operand: "condition",
        expression: "local 1",
        dependsOn: [],
      },
      {
        at: 12,
        instruction: "br_if 1",
        operand: "condition",
        expression: "i32.eqz(local 2)",
        dependsOn: ["#14"],
      },
      {
        at: 17,
        instruction: "br_if 0",
        operand: "condition",
        expression: "local 0",
        dependsOn: [],
      },
    ]);
  });

  it("takes a select's result as deriving from its condition too", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32 i32) (result i32)
        i32.const 0
        i32.const 4096
        local.get 1
        select
        i32.load)`);

    const { functions } = await inspectConstantTime(wasm, [
      setupFunction(0, { secretParams: { 1: "a key bit" } }),
    ]);

    assertEqual(functions[0].findings, [
      {
        at: 4,
        instruction: "select",
        operand: "condition",
        expression: "local 1",
        dependsOn: ["parameter 1"],
      },
      {
        at: 5,
        instruction: "i32.load",
        operand: "address",
        expression: "select(0, 4096, local 1)",
        dependsOn: ["parameter 1"],
      },
    ]);
  });

  it("joins the values that branches and arms carry to the end of a block", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32) (result i32)
        i32.const 0
        i32.const 1
        block (result i32)
          local.get 0
          i32.load
          local.get 0
          br_if 0
          drop
          i32.const 2
        end
        select
        local.get 0
        if (result i32)
          i32.const 1
        else
          local.get 0
          i32.load
        end
        br_if 0)`);

    const { functions } = await inspectConstantTime(wasm, [setupFunction(0)]);

    assertEqual(
      functions[0].findings.map(({ at, expression, dependsOn }) => ({
        at,
        expression,
        dependsOn,
      })),
      [
        { at: 7, expression: "local 0", dependsOn: [] },
        { at: 11, expression: "result of #3", dependsOn: ["#5"] },
        { at: 13, expression: "local 0", dependsOn: [] },
        { at: 19, expression: "result of #13", dependsOn: ["#17"] },
      ],
    );
  });

  it("joins the locals of an if without else, of branches out of a block, and skips an arm that returns", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32) (local i32 i32 i32)
        local.get 0
        if
          local.get 0
          i32.load
          local.set 1
        end
        block
          local.get 0
          i32.load
          local.set 2
          local.get 0
          br_if 0
          i32.const 0
          local.set 2
        end
        local.get 0
        if
          local.get 0
          i32.load
          local.set 3
          return
        else
          i32.const 0
          local.set 3
        end
        local.get 1
        local.get 2
        i32.add
        local.get 3
        i32.add
        br_if 0)`);

    const { functions } = await inspectConstantTime(wasm, [setupFunction(0)]);

    assertEqual(functions[0].findings.at(-1), {
      at: 31,
      instruction: "br_if 0",
      operand: "condition",
      expression: "i32.add(i32.add(local 1, local 2), local 3)",
      dependsOn: ["#4", "#9"],
    });
  });

  it("takes call results as loaded values, and lists call arguments a callee takes as public", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32 i64)
        local.get 1
        i64.eqz
        br_if 0)
      (func (param i32) (result i32)
        local.get 0)
      (func (param i32)
        local.get 0
        i32.load
        local.get 0
        i64.load
        call 0
        local.get 0
        i32.load
        call 1
        br_if 0)`);

    const { functions } = await inspectConstantTime(wasm, [
      setupFunction(0, { secretParams: { 1: "a key word" } }),
      setupFunction(2),
    ]);

    assertEqual(functions[0].findings, [
      {
        at: 3,
        instruction: "br_if 0",
        operand: "condition",
        expression: "i64.eqz(local 1)",
        dependsOn: ["parameter 1"],
      },
    ]);
    assertEqual(functions[1].findings, [
      {
        at: 5,
        instruction: "call 0",
        operand: "argument 0",
        expression: "#2",
        dependsOn: ["#2"],
      },
      {
        at: 8,
        instruction: "call 1",
        operand: "argument 0",
        expression: "#7",
        dependsOn: ["#7"],
      },
      {
        at: 9,
        instruction: "br_if 0",
        operand: "condition",
        expression: "#8",
        dependsOn: ["#8"],
      },
    ]);
    assertEqual(functions[1].sources, [
      { at: 2, instruction: "i32.load", operands: "local 0" },
      { at: 7, instruction: "i32.load", operands: "local 0" },
      { at: 8, instruction: "call 1", operands: "#7" },
    ]);
  });

  it("shortens a long expression", async () => {
    const wasm = await setupWasm(`
      (func (param i32 i32 i32 i32 i32)
        local.get 0
        local.get 1
        i32.add
        local.get 2
        i32.add
        local.get 3
        i32.add
        local.get 4
        i32.add
        br_if 0)`);
    const expression =
      "i32.add(i32.add(i32.add(i32.add(local 0, local 1), local 2), local 3), local 4)";

    const { functions } = await inspectConstantTime(wasm, [setupFunction(0)]);

    assertEqual(
      functions[0].findings[0].expression,
      `${expression.slice(0, 59)}…`,
    );
  });

  it("hashes a function's code, not its index or the indices of its types", async () => {
    const [moved, same, other] = await Promise.all([
      setupWasm(`
        (type (func (param i64)))
        (type $v (func))
        (table 1 funcref)
        (func (type $v)
          i32.const 0
          call_indirect (type $v))`),
      setupWasm(`
        (type $v (func))
        (table 1 funcref)
        (func)
        (func (type $v)
          i32.const 0
          call_indirect (type $v))`),
      setupWasm(`
        (type $v (func))
        (table 1 funcref)
        (func (type $v)
          i32.const 1
          call_indirect (type $v))`),
    ]);

    const hashes = await Promise.all(
      [
        [moved, 0],
        [same, 1],
        [other, 0],
      ].map(
        async ([wasm, index]) =>
          (
            await inspectConstantTime(wasm as Uint8Array, [
              setupFunction(index as number),
            ])
          ).functions[0].sha256,
      ),
    );

    assertEqual(hashes[0], hashes[1]);
    assertEqual(hashes[0] === hashes[2], false);
  });

  it("refuses a function the wasm doesn't define", async () => {
    const wasm = await setupWasm(`
      (import "env" "f" (func))
      (func)`);

    for (const index of [0, 2])
      await assertRejectsWithMessage(
        inspectConstantTime(wasm, [setupFunction(index)]),
        `Function ${index} isn't defined in the wasm.`,
      );
  });

  it("refuses unreachable code and instructions it doesn't model", async () => {
    const cases = [
      [
        "(func unreachable i32.const 0 drop)",
        "Function 0 has unreachable code at #2.",
      ],
      [
        "(func (param i32) (result i32) local.get 0 memory.grow) (memory 1)",
        "Function 0 has the unsupported instruction memory.grow at #2.",
      ],
      [
        "(func block unreachable end nop)",
        "Function 0 has unreachable code at #4.",
      ],
      [
        "(func (param i32) local.get 0 block (param i32) drop end)",
        "Function 0 has the unsupported instruction block (param i32) at #2.",
      ],
    ] as const;

    for (const [fields, message] of cases)
      await assertRejectsWithMessage(
        inspectConstantTime(await setupWasm(fields), [setupFunction(0)]),
        message,
      );
  });
});

describe("renderListing", () => {
  it("classifies each finding by the reviews of what it depends on", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (param i32) (result i32)
        local.get 0)
      (func (param i32 i32)
        local.get 0
        br_if 0
        local.get 0
        i32.load
        br_if 0
        local.get 0
        call 0
        br_if 0
        local.get 1
        br_if 0
        local.get 0
        i32.load
        local.get 0
        call 0
        i32.add
        br_if 0
        local.get 1
        local.get 0
        i32.load
        i32.add
        br_if 0)
      (func)`);
    const reviewed = await setupReviewed(wasm, {
      name: "check",
      index: 1,
      summary: "Checks a page.",
      secretParams: { 1: "a key byte" },
      sources: {
        4: { type: "Public", reason: "the page's length" },
        7: { type: "Secret", reason: "the key's first byte" },
        12: { type: "Public", reason: "the page's size" },
        14: { type: "Public", reason: "the page's number" },
        19: { type: "Public", reason: "the page's flags" },
      },
    });
    const empty = await setupReviewed(wasm, {
      name: "nothing",
      index: 2,
      summary: "Does nothing.",
    });

    const inspection = await inspectConstantTime(wasm, [reviewed, empty]);

    assertEqual(inspection.problems, []);
    assertEqual(renderListing(inspection).split("\n## ").slice(1), [
      [
        "`check`, function 1",
        "",
        "Checks a page.",
        "",
        `Code sha256 \`${reviewed.sha256}\`, 21 instructions. Parameter 1 holds a secret: a key byte.`,
        "",
        "- #2 `br_if 0` with condition `local 0`: secret-independent, only parameters, constants and globals",
        "- #5 `br_if 0` with condition `#4`: secret-independent, #4 is public",
        "- #8 `br_if 0` with condition `#7`: secret-dependent, #7 is secret",
        "- #10 `br_if 0` with condition `local 1`: secret-dependent, parameter 1 is secret",
        "- #16 `br_if 0` with condition `i32.add(#12, #14)`: secret-independent, #12 and #14 are public",
        "- #21 `br_if 0` with condition `i32.add(local 1, #19)`: secret-dependent, parameter 1 is secret",
        "",
        "Loaded values and call results:",
        "",
        "- #4 `i32.load` at `local 0`: public, the page's length",
        "- #7 `call 0` of `local 0`: secret, the key's first byte",
        "- #12 `i32.load` at `local 0`: public, the page's size",
        "- #14 `call 0` of `local 0`: public, the page's number",
        "- #19 `i32.load` at `local 0`: public, the page's flags",
        "",
      ].join("\n"),
      [
        "`nothing`, function 2",
        "",
        "Does nothing.",
        "",
        `Code sha256 \`${empty.sha256}\`, 0 instructions.`,
        "",
        "No findings.",
        "",
      ].join("\n"),
    ]);
  });

  it("lists an unreviewed value, a review of nothing and a review of other code as problems", async () => {
    const wasm = await setupWasm(`
      (memory 1)
      (func (result i32)
        i32.const 0)
      (func (param i32)
        call 0
        local.get 0
        i32.load
        i32.add
        local.get 0
        i32.load
        i32.add
        br_if 0)`);
    const reviewed = await setupReviewed(wasm, {
      name: "check",
      index: 1,
      summary: "Checks.",
      sources: {
        1: { type: "Public", reason: "a count" },
        3: { type: "Secret", reason: "a key byte" },
        9: { type: "Public", reason: "nothing" },
      },
    });
    const stale = { ...reviewed, name: "stale", sha256: "abc" };

    const inspection = await inspectConstantTime(wasm, [reviewed, stale]);
    const [, checkSection, staleSection] =
      renderListing(inspection).split("\n## ");

    assertEqual(inspection.problems, [
      "check: #6 is not reviewed.",
      "check: #9 is reviewed, but no finding depends on it.",
      `stale: its review covers code sha256 abc, but function 1 has ${reviewed.sha256}.`,
    ]);
    assertEqual(checkSection.split("\n").slice(6), [
      "- #8 `br_if 0` with condition `i32.add(i32.add(#1, #3), #6)`: not reviewed, #6",
      "",
      "Loaded values and call results:",
      "",
      "- #1 `call 0`: public, a count",
      "- #3 `i32.load` at `local 0`: secret, a key byte",
      "- #6 `i32.load` at `local 0`: not reviewed",
      "",
    ]);
    assertEqual(staleSection.split("\n").slice(4, 7), [
      `Code sha256 \`${reviewed.sha256}\`, 8 instructions. Its review covers code sha256 \`abc\`.`,
      "",
      "- #8 `br_if 0` with condition `i32.add(i32.add(#1, #3), #6)`: not reviewed, #1, #3 and #6",
    ]);
  });
});

describe("inspectWithSymbolMap", () => {
  it("takes each function's index from the symbol map, and lists reviews of other indices and of names it lacks or repeats", async () => {
    const wasm = await setupWasm(`
      (func (export "first"))
      (func (export "second")
        i32.const 0
        br_if 0)
      (func)`);
    const symbolMap = "0:first\n1:second\n2:first\n";

    const inspection = await inspectWithSymbolMap(wasm, symbolMap, [
      setupFunction(5, { name: "second" }),
      setupFunction(0, { name: "missing" }),
      setupFunction(0, { name: "first" }),
    ]);

    assertEqual(
      inspection.functions.map(({ review }) => [review.name, review.index]),
      [["second", 1]],
    );
    assertEqual(inspection.problems, [
      "second is function 1 in the symbol map, but its review says 5.",
      "missing isn't in the symbol map.",
      "first names functions 0 and 2 in the symbol map.",
      `second: its review covers code sha256 , but function 1 has ${inspection.functions[0].sha256}.`,
    ]);
  });

  it("refuses a symbol map that puts an exported function elsewhere, also the last export", async () => {
    // The exports are the module's last field.
    const wasm = await setupWasm(`
      (func (export "first"))
      (func (export "second"))
      (func)`);

    await assertRejectsWithMessage(
      inspectWithSymbolMap(wasm, "0:second\n1:first\n2:other\n", []),
      "The symbol map puts first at function 1, but the wasm exports it as function 0.",
    );
    await assertRejectsWithMessage(
      inspectWithSymbolMap(wasm, "0:first\n1:other\n2:second\n", []),
      "The symbol map puts second at function 2, but the wasm exports it as function 1.",
    );
  });
});

describe("the pinned wasm", () => {
  it("has the reviewed findings of constant-time.md", async (t) => {
    const inspection = await inspectConstantTime(
      readPinnedWasm(),
      reviewedFunctions,
    );

    assertEqual(inspection.problems, []);
    t.assert.fileSnapshot(renderListing(inspection), listingPath, {
      serializers: [(listing: unknown) => listing],
    });
  });
});

describe("runConstantTimeCli", () => {
  it("prints the listing of a wasm with the indices of its symbol map", async (t) => {
    const directory = setupDirectory(t);
    const logged = setupLog(t);
    const wasm = await setupWasm(`
      (func (param i32)
        local.get 0
        br_if 0)`);
    writeFileSync(join(directory, "test.wasm"), wasm);
    writeFileSync(join(directory, "test.symbols"), "0:check\n");
    const review = await setupReviewed(wasm, {
      name: "check",
      index: 0,
      summary: "Checks.",
    });

    const status = await runConstantTimeCli(
      [join(directory, "test.wasm"), join(directory, "test.symbols")],
      [review],
    );

    assertEqual(status, 0);
    assertEqual(logged(), [
      renderListing(await inspectConstantTime(wasm, [review])),
    ]);
  });

  it("prints the problems after the listing and fails", async (t) => {
    const directory = setupDirectory(t);
    const logged = setupLog(t);
    const wasm = await setupWasm("(func)");
    writeFileSync(join(directory, "test.wasm"), wasm);
    writeFileSync(join(directory, "test.symbols"), "0:check\n");
    const review = setupFunction(0, { name: "check" });

    const status = await runConstantTimeCli(
      [join(directory, "test.wasm"), join(directory, "test.symbols")],
      [review],
    );
    const inspection = await inspectConstantTime(wasm, [review]);

    assertEqual(status, 1);
    assertEqual(logged(), [renderListing(inspection), ...inspection.problems]);
  });

  it("prints its usage without a wasm and a symbol map", async (t) => {
    const logged = setupLog(t);

    assertEqual(await runConstantTimeCli([], []), 2);
    assertEqual(logged(), [
      "Usage: node scripts/constant-time.mts <wasm> <symbol map>",
    ]);
  });

  it("runs as a script with the reviewed functions", (t) => {
    const symbolMap = join(setupDirectory(t), "sqlite3.symbols");
    writeFileSync(
      symbolMap,
      reviewedFunctions.map(({ index, name }) => `${index}:${name}\n`).join(""),
    );

    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("constant-time.mts", import.meta.url)),
        wasmPath,
        symbolMap,
      ],
      { encoding: "utf8" },
    );

    assertEqual(
      [result.status, result.stdout, result.stderr],
      [0, `${readFileSync(listingPath, "utf8")}\n`, ""],
    );
  });
});

const listingPath = fileURLToPath(new URL("constant-time.md", import.meta.url));

const setupWasm = async (fields: string): Promise<Uint8Array> =>
  (await createWabt())
    .parseWat("test.wat", `(module\n${fields}\n)`)
    .toBinary({}).buffer;

/** A function to inspect, whose review covers no code. */
const setupFunction = (
  index: number,
  review: Partial<ReviewedFunction> = {},
): ReviewedFunction => ({
  name: `function${index}`,
  index,
  sha256: "",
  summary: "",
  ...review,
});

/** A review that covers the code the wasm has at its index. */
const setupReviewed = async (
  wasm: Uint8Array,
  review: Omit<ReviewedFunction, "sha256">,
): Promise<ReviewedFunction> => {
  const { functions } = await inspectConstantTime(wasm, [
    { ...review, sha256: "" },
  ]);
  return { ...review, sha256: functions[0].sha256 };
};

const setupLog = (t: TestContext) => {
  const log = t.mock.method(console, "log", () => undefined);
  return (): ReadonlyArray<string> =>
    log.mock.calls.map(({ arguments: [message] }) => String(message));
};

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-constant-time-"));
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
