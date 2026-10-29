/**
 * Lists where the compiled crypto of `wasm/sqlite3.wasm` could branch or reach
 * memory by a secret, and keeps the review of each finding in
 * `constant-time.md`.
 *
 * The C of `@evolu/sqlite-core` runs in constant time: no branch or memory
 * index depends on a key, a message or a tag. Clang and Binaryen may still
 * compile it into a branch or a table lookup, so this inspects the wasm itself.
 * It inspects the functions of AES (BearSSL's `aes_ct64`), SHA-512 (BearSSL's
 * `sha2big` and the core's framing), HMAC-SHA512, PBKDF2 and the page codec
 * around the tag comparison, and those they were inlined into. Inlined
 * functions no longer exist on their own, so each review's summary says what
 * its function holds.
 *
 * The wasm has no name section, so the functions are found by name in the
 * symbol map Emscripten writes with `--emit-symbol-map`, which `build-wasm.mts`
 * keeps as `wasm/sqlite3.symbols` without changing the wasm's bytes. After
 * Emscripten writes the map, SQLite's makefile only strips the wasm's custom
 * sections and runs wasm-opt passes that add and remove no function, and every
 * exported function the map names must be at its index. The map lacks
 * `__handle_stack_overflow` and `__set_stack_limits`, which Emscripten's stack
 * overflow check adds without names.
 *
 * It decodes the wasm with wabt, whose `wasm-strip` the build uses, into the
 * text `wasm2wat` prints, one instruction per line, and `#N` numbers a
 * function's instructions from 1 in that text. Every operand records what it
 * derives from: loaded values, call results and parameters that hold a secret.
 * Loop bodies run again until their locals settle. Only data flows count, not
 * which branch ran, since a branch on a secret is a finding itself, but a
 * `select`'s result derives from its condition too. Parameters are public
 * unless a review lists them as secret, and each call checks that: an argument
 * that derives from any of those is a finding unless the callee takes a secret
 * there. Globals, such as the stack pointer and its limits, are public.
 *
 * A function's findings are every `br_if`, `if`, `select`, `br_table` and
 * `call_indirect`, and each load, store, `memory.copy`, `memory.fill`, call
 * argument, `global.set`, division and remainder whose address, size or operand
 * derives from a loaded value, a call's result or a secret parameter. Its
 * review classifies each loaded value and call result those findings derive
 * from as public or secret, and covers its code by sha256, so a changed
 * function needs a new review. A finding is secret-dependent when it derives
 * from a secret.
 *
 * A call passes no finding into its callee, so each call to a function the wasm
 * defines goes to a reviewed function, or its review says why that function
 * needs none, and each `call_indirect`'s review names the functions it reaches.
 * A helper the compiler stops inlining then needs a review of its own. Imports
 * are the host's functions, not compiled C, so they need none.
 *
 * This shows that the wasm keeps the C's constant time, not that a machine runs
 * it in constant time: wasm and its JIT compilers promise none.
 *
 * Usage: `constant-time.test.mts` fails when the code of an inspected function
 * changes. Build the wasm, which writes the symbol map, then in this package
 * run `node scripts/constant-time.mts wasm/sqlite3.wasm wasm/sqlite3.symbols`,
 * which prints the listing with the map's indices and lists what lacks a
 * review. Review the changed functions in {@link reviewedFunctions}, and write
 * the listing with `pnpm test:node --test-update-snapshots
 * packages/sqlite-wasm/scripts/constant-time.test.mts` in the repository root.
 */

import type { Typed } from "@evolu/common";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import createWabt from "wabt";

/** A function of the wasm to inspect, with the review of its findings. */
export interface ReviewedFunction {
  /** Its name in the symbol map. */
  readonly name: string;
  readonly index: number;
  /** The {@link InspectedFunction} sha256 of the code the review covers. */
  readonly sha256: string;
  /** What the function computes, and what was inlined into it. */
  readonly summary: string;
  /** What each parameter that holds a secret holds, by its index. */
  readonly secretParams?: Readonly<Record<number, string>>;
  /** Each loaded value and call result the findings derive from, by its `#N`. */
  readonly sources?: Readonly<Record<number, SourceReview>>;
  /**
   * Why each function it calls that the wasm defines and no review inspects
   * needs no review, by the call's `#N`.
   */
  readonly calls?: Readonly<Record<number, string>>;
}

export type SourceReview = PublicSource | SecretSource;

export interface PublicSource extends Typed<"Public"> {
  readonly reason: string;
}

export interface SecretSource extends Typed<"Secret"> {
  readonly reason: string;
}

/** The findings of the inspected functions, and what their reviews lack. */
export interface Inspection {
  readonly functions: ReadonlyArray<InspectedFunction>;
  readonly problems: ReadonlyArray<string>;
}

export interface InspectedFunction {
  readonly review: ReviewedFunction;
  /**
   * The sha256 of its type, locals and instructions, with each type index
   * replaced by its type, so it doesn't change when only type indices do.
   */
  readonly sha256: string;
  readonly instructions: number;
  readonly findings: ReadonlyArray<Finding>;
  /** The loaded values and call results the findings derive from. */
  readonly sources: ReadonlyArray<Source>;
  /** Its calls to functions the wasm defines and no review inspects. */
  readonly unreviewedCalls: ReadonlyArray<UnreviewedCall>;
}

export interface UnreviewedCall {
  /** The call's `#N`. */
  readonly at: number;
  /** The callee's index, or null for a `call_indirect`. */
  readonly callee: number | null;
}

export interface Finding {
  /** The instruction's `#N`. */
  readonly at: number;
  readonly instruction: string;
  /** Which operands, such as a condition or an address. */
  readonly operand: string;
  readonly expression: string;
  /** Its loaded values, call results and secret parameters. */
  readonly dependsOn: ReadonlyArray<string>;
}

/** A load or a call whose result a finding derives from. */
export interface Source {
  readonly at: number;
  readonly instruction: string;
  /** A load's address or a call's arguments. */
  readonly operands: string;
}

/** Inspects each function at its review's index. */
export const inspectConstantTime = async (
  wasm: Uint8Array,
  functions: ReadonlyArray<ReviewedFunction>,
): Promise<Inspection> => inspectModule(await readModule(wasm), functions);

/**
 * Inspects each function at the index the symbol map gives its name, after
 * checking that the map names each exported function it has at its index.
 */
export const inspectWithSymbolMap = async (
  wasm: Uint8Array,
  symbolMap: string,
  functions: ReadonlyArray<ReviewedFunction>,
): Promise<Inspection> => {
  const module = await readModule(wasm);
  const indicesByName = Map.groupBy(
    symbolMap
      .trim()
      .split("\n")
      .map((line) => {
        const colon = line.indexOf(":");
        return {
          index: Number(line.slice(0, colon)),
          name: line.slice(colon + 1),
        };
      }),
    ({ name }) => name,
  );
  for (const [name, index] of module.exports) {
    const indices = indicesByName.get(name)?.map((entry) => entry.index);
    if (indices != null && !indices.includes(index))
      throw new Error(
        `The symbol map puts ${name} at function ${indices.join(", ")}, but the wasm exports it as function ${index}.`,
      );
  }
  const problems: Array<string> = [];
  const located: Array<ReviewedFunction> = [];
  for (const review of functions) {
    const indices = indicesByName.get(review.name)?.map((entry) => entry.index);
    if (indices == null)
      problems.push(`${review.name} isn't in the symbol map.`);
    else if (indices.length > 1)
      problems.push(
        `${review.name} names functions ${listOf(indices.map(String))} in the symbol map.`,
      );
    else {
      if (indices[0] !== review.index)
        problems.push(
          `${review.name} is function ${indices[0]} in the symbol map, but its review says ${review.index}.`,
        );
      located.push({ ...review, index: indices[0] });
    }
  }
  const inspection = inspectModule(module, located);
  return {
    functions: inspection.functions,
    problems: [...problems, ...inspection.problems],
  };
};

/** Renders an inspection as `constant-time.md`. */
export const renderListing = (inspection: Inspection): string =>
  [listingIntro, ...inspection.functions.map(renderFunction)].join("\n");

/**
 * Prints the listing of `<wasm>` with the indices of `<symbol map>` and then
 * the problems, and returns the exit status: 1 when there are problems.
 */
export const runConstantTimeCli = async (
  args: ReadonlyArray<string>,
  functions: ReadonlyArray<ReviewedFunction>,
): Promise<number> => {
  if (args.length !== 2) {
    log("Usage: node scripts/constant-time.mts <wasm> <symbol map>");
    return 2;
  }
  const inspection = await inspectWithSymbolMap(
    readFileSync(args[0]),
    readFileSync(args[1], "utf8"),
    functions,
  );
  log(renderListing(inspection));
  for (const problem of inspection.problems) log(problem);
  return inspection.problems.length > 0 ? 1 : 0;
};

/** The wasm as wasm2wat prints it, with the types of its functions. */
interface WasmModule {
  /**
   * Its fields, without the module's closing parenthesis, which would end the
   * last field's line, and with an empty field after the last, so each function
   * ends where the next field starts.
   */
  readonly fields: string;
  readonly types: ReadonlyMap<number, FunctionType>;
  /** Each function's type index, imported functions first. */
  readonly functionTypes: ReadonlyMap<number, number>;
  readonly importedFunctions: ReadonlySet<number>;
  /** Each exported function's index, by its export name. */
  readonly exports: ReadonlyMap<string, number>;
}

interface FunctionType {
  /** As wasm2wat prints it, such as `(func (param i32) (result i32))`. */
  readonly text: string;
  readonly params: number;
}

const readModule = async (wasm: Uint8Array): Promise<WasmModule> => {
  const text = (await createWabt())
    // wabt 1.0.39 reads a view's whole ArrayBuffer, such as the pool of a
    // small Buffer from readFileSync, so it gets a copy of just the view.
    // Fixed upstream in https://github.com/WebAssembly/wabt/pull/2724, which
    // no npm release has yet.
    .readWasm(new Uint8Array(wasm), { readDebugNames: false })
    .toText({ foldExprs: false, inlineExport: false });
  const fields = `${text.trimEnd().slice(0, -1)}\n  (`;
  return {
    fields,
    types: new Map(
      [...fields.matchAll(/^ {2}\(type \(;(\d+);\) (\(func.*\))\)$/gmu)].map(
        ([, index, type]) => [
          Number(index),
          {
            text: type,
            params: [...type.matchAll(/\(param ([^)]*)\)/gu)].flatMap(
              ([, params]) => params.split(" "),
            ).length,
          },
        ],
      ),
    ),
    functionTypes: new Map(
      [
        ...fields.matchAll(
          /^ {2}\((?:import "[^"]*" "[^"]*" \()?func \(;(\d+);\) \(type (\d+)\)/gmu,
        ),
      ].map(([, index, type]) => [Number(index), Number(type)]),
    ),
    importedFunctions: new Set(
      [
        ...fields.matchAll(
          /^ {2}\(import "[^"]*" "[^"]*" \(func \(;(\d+);\)/gmu,
        ),
      ].map(([, index]) => Number(index)),
    ),
    exports: new Map(
      [...fields.matchAll(/^ {2}\(export "([^"]*)" \(func (\d+)\)\)$/gmu)].map(
        ([, name, index]) => [name, Number(index)],
      ),
    ),
  };
};

const inspectModule = (
  module: WasmModule,
  functions: ReadonlyArray<ReviewedFunction>,
): Inspection => {
  const reviewByIndex = new Map(
    functions.map((review) => [review.index, review]),
  );
  const inspected = functions.map((review) =>
    inspectFunction(module, review, reviewByIndex),
  );
  return { functions: inspected, problems: inspected.flatMap(problemsOf) };
};

const inspectFunction = (
  module: WasmModule,
  review: ReviewedFunction,
  reviewByIndex: ReadonlyMap<number, ReviewedFunction>,
): InspectedFunction => {
  const { fields } = module;
  const start = fields.indexOf(`\n  (func (;${review.index};) `);
  if (start === -1)
    throw new Error(`Function ${review.index} isn't defined in the wasm.`);
  const lines = fields
    .slice(start + 1, fields.indexOf("\n  (", start + 1))
    .split("\n");
  // The last line closes the function.
  lines.push(lines.pop()!.slice(0, -1));
  const [header, ...body] = lines;
  const type = module.types.get(Number(/\(type (\d+)\)/u.exec(header)![1]))!;
  const locals = body.filter((line) => line.startsWith("    (local "));
  const instructions = body.slice(locals.length).map((line) =>
    line
      .replaceAll(/\(;[^;]*;\)|;;.*$/gu, "")
      .trim()
      .replaceAll(/\s+/gu, " "),
  );
  const localCount =
    type.params +
    locals.flatMap((line) => line.trim().slice(7, -1).split(" ")).length;
  return {
    review,
    sha256: createHash("sha256")
      .update(
        [
          type.text,
          ...locals,
          ...instructions.map((instruction) =>
            instruction.replace(
              /\(type (\d+)\)/u,
              (_, index: string) =>
                `(type ${module.types.get(Number(index))!.text})`,
            ),
          ),
        ].join("\n"),
      )
      .digest("hex"),
    instructions: instructions.length,
    ...analyze(module, review, reviewByIndex, instructions, localCount),
  };
};

/** The loaded values, call results and secret parameters a value derives from. */
type Taint = ReadonlySet<string>;

interface Value {
  readonly taint: Taint;
  /** As an expression for the listing. */
  readonly text: string;
}

/** A block, loop or if, and what arrives at its end. */
interface Frame {
  /** An if with an else is `else` from the else on. */
  readonly kind: "block" | "loop" | "if" | "else";
  readonly at: number;
  /** The height of the stack below its values. */
  readonly height: number;
  readonly results: number;
  /** The locals at its start, which an if without else ends with too. */
  readonly start: ReadonlyArray<Taint>;
  readonly arrivals: Array<Arrival>;
}

/** The locals and the taint of the results that arrive at a block's end. */
interface Arrival {
  readonly locals: ReadonlyArray<Taint>;
  readonly results: Taint;
}

/**
 * Runs through the instructions, again until each loop's locals at its start
 * include those of every branch back to it, and returns the findings of the
 * last run.
 */
const analyze = (
  module: WasmModule,
  review: ReviewedFunction,
  reviewByIndex: ReadonlyMap<number, ReviewedFunction>,
  instructions: ReadonlyArray<string>,
  localCount: number,
): Pick<InspectedFunction, "findings" | "sources" | "unreviewedCalls"> => {
  const loopStarts = new Map<number, ReadonlyArray<Taint>>();
  for (;;) {
    let settled = true;
    let live = true;
    let locals: ReadonlyArray<Taint> = Array.from(
      { length: localCount },
      (_, index) =>
        review.secretParams?.[index] == null
          ? noTaint
          : new Set([`parameter ${index}`]),
    );
    const stack: Array<Value> = [];
    const frames: Array<Frame> = [];
    const findings: Array<Finding> = [];
    const sources = new Map<string, Source>();
    const unreviewedCalls: Array<UnreviewedCall> = [];

    const pop = (): Value => stack.pop()!;
    const popMany = (count: number): ReadonlyArray<Value> =>
      stack.splice(stack.length - count, count);
    const arrival = (results: number): Arrival => ({
      locals,
      results: join(...stack.slice(stack.length - results).map(taintOf)),
    });
    /** Joins the locals with those a loop starts with. */
    const enterLoop = (at: number): ReadonlyArray<Taint> => {
      const previous = loopStarts.get(at) ?? locals.map(() => noTaint);
      const joined = previous.map((taint, index) => join(taint, locals[index]));
      if (joined.some((taint, index) => taint.size !== previous[index].size))
        settled = false;
      loopStarts.set(at, joined);
      return joined;
    };
    const branch = (depth: number): void => {
      const frame = frames.at(-1 - depth);
      // The function's own label returns.
      if (frame == null) return;
      if (frame.kind === "loop") enterLoop(frame.at);
      else frame.arrivals.push(arrival(frame.results));
    };

    instructions.forEach((instruction, index) => {
      const at = index + 1;
      const [op, ...immediates] = instruction.split(" ");
      const unsupported = (): Error =>
        new Error(
          `Function ${review.index} has the unsupported instruction ${instruction} at #${at}.`,
        );
      const note = (
        operand: string,
        values: ReadonlyArray<Value>,
        always = false,
      ): void => {
        const taint = join(...values.map(taintOf));
        if (always || taint.size > 0)
          findings.push({
            at,
            instruction,
            operand,
            expression: values.map(({ text }) => text).join(", "),
            dependsOn: [...taint].toSorted(
              (a, b) => sourceRank(a) - sourceRank(b),
            ),
          });
      };
      const pushSource = (operands: string): void => {
        sources.set(`#${at}`, { at, instruction, operands });
        stack.push({ taint: new Set([`#${at}`]), text: `#${at}` });
      };
      /** Notes data arguments of public parameters, and pushes the results. */
      const call = (
        type: FunctionType & { readonly results: number },
        callee: ReviewedFunction | undefined,
      ): void => {
        const args = popMany(type.params);
        args.forEach((arg, param) => {
          if (callee?.secretParams?.[param] == null)
            note(`argument ${param}`, [arg]);
        });
        for (let result = 0; result < type.results; result++)
          pushSource(args.map(({ text }) => text).join(", "));
      };

      if (!live && op !== "end" && op !== "else")
        throw new Error(
          `Function ${review.index} has unreachable code at #${at}.`,
        );
      switch (op) {
        case "block":
        case "loop":
        case "if": {
          const blockType = immediates.join(" ");
          if (blockType !== "" && !/^\(result [^()]*\)$/u.test(blockType))
            throw unsupported();
          if (op === "if") note("condition", [pop()], true);
          if (op === "loop") locals = enterLoop(at);
          frames.push({
            kind: op,
            at,
            height: stack.length,
            results: blockType === "" ? 0 : blockType.split(" ").length - 1,
            start: locals,
            arrivals: [],
          });
          break;
        }
        case "else": {
          const frame = frames.pop()!;
          frames.push({
            ...frame,
            kind: "else",
            arrivals: live
              ? [...frame.arrivals, arrival(frame.results)]
              : frame.arrivals,
          });
          stack.length = frame.height;
          locals = frame.start;
          live = true;
          break;
        }
        case "end": {
          const frame = frames.pop()!;
          const arrivals = [
            ...frame.arrivals,
            ...(live ? [arrival(frame.results)] : []),
            ...(frame.kind === "if"
              ? [{ locals: frame.start, results: noTaint }]
              : []),
          ];
          stack.length = frame.height;
          live = arrivals.length > 0;
          locals = locals.map((_, local) =>
            join(...arrivals.map((arrived) => arrived.locals[local])),
          );
          const results = join(...arrivals.map((arrived) => arrived.results));
          for (let result = 0; result < frame.results; result++)
            stack.push({ taint: results, text: `result of #${frame.at}` });
          break;
        }
        case "br":
          branch(Number(immediates[0]));
          live = false;
          break;
        case "br_if":
          note("condition", [pop()], true);
          branch(Number(immediates[0]));
          break;
        case "br_table":
          note("index", [pop()], true);
          immediates.forEach((depth) => {
            branch(Number(depth));
          });
          live = false;
          break;
        case "return":
        case "unreachable":
          live = false;
          break;
        case "nop":
          break;
        case "drop":
          pop();
          break;
        case "select": {
          const [first, second, condition] = popMany(3);
          note("condition", [condition], true);
          stack.push({
            taint: join(first.taint, second.taint, condition.taint),
            text: shorten(
              `select(${first.text}, ${second.text}, ${condition.text})`,
            ),
          });
          break;
        }
        case "local.get":
          stack.push({
            taint: locals[Number(immediates[0])],
            text: `local ${immediates[0]}`,
          });
          break;
        case "local.set":
        case "local.tee": {
          const value = op === "local.set" ? pop() : stack.at(-1)!;
          locals = locals.with(Number(immediates[0]), value.taint);
          break;
        }
        case "global.get":
          stack.push({ taint: noTaint, text: `global ${immediates[0]}` });
          break;
        case "global.set":
          note("value", [pop()]);
          break;
        case "memory.copy":
          note("destination, source and size", popMany(3));
          break;
        case "memory.fill": {
          const [destination, , size] = popMany(3);
          note("destination and size", [destination, size]);
          break;
        }
        case "call": {
          const callee = Number(immediates[0]);
          const calleeReview = reviewByIndex.get(callee);
          if (calleeReview == null && !module.importedFunctions.has(callee))
            unreviewedCalls.push({ at, callee });
          call(
            functionType(module, module.functionTypes.get(callee)!),
            calleeReview,
          );
          break;
        }
        case "call_indirect":
          note("table index", [pop()], true);
          unreviewedCalls.push({ at, callee: null });
          call(
            functionType(
              module,
              Number(/\(type (\d+)\)/u.exec(instruction)![1]),
            ),
            undefined,
          );
          break;
        default:
          if (op.endsWith(".const"))
            stack.push({ taint: noTaint, text: immediates.join(" ") });
          else if (/^[if](32|64)\.load/u.test(op)) {
            const address = pop();
            note("address", [address]);
            pushSource(address.text);
          } else if (/^[if](32|64)\.store/u.test(op)) {
            const [address] = popMany(2);
            note("address", [address]);
          } else if (unaryPattern.test(op)) {
            const operand = pop();
            stack.push({
              taint: operand.taint,
              text: shorten(`${op}(${operand.text})`),
            });
          } else if (binaryPattern.test(op)) {
            const operands = popMany(2);
            if (/\.(div|rem)/u.test(op)) note("operands", operands);
            stack.push({
              taint: join(...operands.map(taintOf)),
              text: shorten(`${op}(${operands[0].text}, ${operands[1].text})`),
            });
          } else throw unsupported();
      }
    });

    if (settled) {
      const used = new Set(findings.flatMap(({ dependsOn }) => dependsOn));
      return {
        findings,
        sources: [...sources.values()].filter(({ at }) => used.has(`#${at}`)),
        unreviewedCalls,
      };
    }
  }
};

const noTaint: Taint = new Set();

const join = (...taints: ReadonlyArray<Taint>): Taint =>
  new Set(taints.flatMap((taint) => [...taint]));

const taintOf = ({ taint }: Value): Taint => taint;

/** Orders secret parameters first, then values by their `#N`. */
const sourceRank = (id: string): number =>
  id.startsWith("#")
    ? Number(id.slice(1))
    : Number(id.slice("parameter ".length)) - 2 ** 32;

const shorten = (text: string): string =>
  text.length > 60 ? `${text.slice(0, 59)}…` : text;

const functionType = (
  module: WasmModule,
  index: number,
): FunctionType & { readonly results: number } => {
  const type = module.types.get(index)!;
  return {
    ...type,
    results: [...type.text.matchAll(/\(result ([^)]*)\)/gu)].flatMap(
      ([, results]) => results.split(" "),
    ).length,
  };
};

const unaryPattern =
  /^[if](32|64)\.(eqz|clz|ctz|popcnt|abs|neg|sqrt|ceil|floor|trunc|nearest|wrap_i64|extend(8|16|32)_s|extend_i32_[su]|trunc(_sat)?_f(32|64)_[su]|convert_i(32|64)_[su]|demote_f64|promote_f32|reinterpret_[fi](32|64))$/u;

const binaryPattern =
  /^[if](32|64)\.(add|sub|mul|div(_[su])?|rem_[su]|and|or|xor|shl|shr_[su]|rotl|rotr|eq|ne|[lg][te](_[su])?|min|max|copysign)$/u;

const problemsOf = ({
  review,
  sha256,
  sources,
  unreviewedCalls,
}: InspectedFunction): ReadonlyArray<string> => {
  if (sha256 !== review.sha256)
    return [
      `${review.name}: its review covers code sha256 ${review.sha256}, but function ${review.index} has ${sha256}.`,
    ];
  const used = new Set(sources.map(({ at }) => at));
  const called = new Set(unreviewedCalls.map(({ at }) => at));
  return [
    ...sources
      .filter(({ at }) => review.sources?.[at] == null)
      .map(({ at }) => `${review.name}: #${at} is not reviewed.`),
    ...Object.keys(review.sources ?? {})
      .map(Number)
      .filter((at) => !used.has(at))
      .map(
        (at) =>
          `${review.name}: #${at} is reviewed, but no finding depends on it.`,
      ),
    ...unreviewedCalls
      .filter(({ at }) => review.calls?.[at] == null)
      .map(({ at, callee }) =>
        callee === null
          ? `${review.name}: #${at} calls through the table, and its review names no function it reaches.`
          : `${review.name}: #${at} calls function ${callee}, which has no review.`,
      ),
    ...Object.keys(review.calls ?? {})
      .map(Number)
      .filter((at) => !called.has(at))
      .map(
        (at) =>
          `${review.name}: #${at} is reviewed as a call, but doesn't call a function without a review.`,
      ),
  ];
};

const listingIntro = `# Constant time in sqlite3.wasm

\`scripts/constant-time.mts\` lists this from the pinned \`wasm/sqlite3.wasm\` and the reviews it holds, and \`scripts/constant-time.test.mts\` fails when it changes. Its module documentation describes the inspection.

For each function of AES, SHA-512, HMAC-SHA512, PBKDF2 and the page codec around the tag comparison, it lists every \`br_if\`, \`if\`, \`select\`, \`br_table\` and \`call_indirect\`, and each load, store, \`memory.copy\`, \`memory.fill\`, call argument, \`global.set\`, division and remainder whose address, size or operand derives from a loaded value, a call's result or a parameter that holds a secret. \`#N\` is a function's Nth instruction as \`wasm2wat\` prints it, and \`local N\` and \`global N\` are its locals, parameters first, and the module's globals. Each loaded value and call result a finding derives from is reviewed as public or secret, each call to a function the wasm defines and no review inspects says why that function needs none, and each \`call_indirect\` which functions it reaches. The \`if\` at the start and end of a function with a stack frame is Emscripten's stack overflow check, which compares the stack pointer, \`global 0\`, with the stack's limits, \`global 3\` and \`global 4\`.

This shows that the wasm keeps the C's constant time, not that a machine runs it in constant time: wasm and its JIT compilers promise none.
`;

const renderFunction = ({
  review,
  sha256,
  instructions,
  findings,
  sources,
  unreviewedCalls,
}: InspectedFunction): string => {
  const isStale = sha256 !== review.sha256;
  const statusOf = (id: string): "public" | "secret" | "not reviewed" => {
    if (!id.startsWith("#")) return "secret";
    const source = isStale ? undefined : review.sources?.[Number(id.slice(1))];
    return source == null
      ? "not reviewed"
      : source.type === "Public"
        ? "public"
        : "secret";
  };
  const classify = ({ dependsOn }: Finding): string => {
    if (dependsOn.length === 0)
      return "secret-independent, only parameters, constants and globals";
    const unreviewed = dependsOn.filter(
      (id) => statusOf(id) === "not reviewed",
    );
    if (unreviewed.length > 0) return `not reviewed, ${listOf(unreviewed)}`;
    const secret = dependsOn.filter((id) => statusOf(id) === "secret");
    return secret.length > 0
      ? `secret-dependent, ${listOf(secret)} ${isOrAre(secret)} secret`
      : `secret-independent, ${listOf(dependsOn)} ${isOrAre(dependsOn)} public`;
  };
  const describeSource = ({ at, instruction, operands }: Source): string => {
    const source = isStale ? undefined : review.sources?.[at];
    const what = instruction.startsWith("call")
      ? operands === ""
        ? ""
        : ` of \`${operands}\``
      : ` at \`${operands}\``;
    const status =
      source == null
        ? "not reviewed"
        : `${source.type === "Public" ? "public" : "secret"}, ${source.reason}`;
    return `- #${at} \`${instruction}\`${what}: ${status}`;
  };
  return [
    `## \`${review.name}\`, function ${review.index}`,
    "",
    review.summary,
    "",
    [
      `Code sha256 \`${sha256}\`, ${instructions} instructions.`,
      ...Object.entries(review.secretParams ?? {}).map(
        ([param, reason]) => `Parameter ${param} holds a secret: ${reason}.`,
      ),
      ...(isStale
        ? [`Its review covers code sha256 \`${review.sha256}\`.`]
        : []),
    ].join(" "),
    "",
    ...(findings.length === 0
      ? ["No findings."]
      : findings.map(
          (finding) =>
            `- #${finding.at} \`${finding.instruction}\` with ${finding.operand} \`${finding.expression}\`: ${classify(finding)}`,
        )),
    ...(sources.length === 0
      ? []
      : [
          "",
          "Loaded values and call results:",
          "",
          ...sources.map(describeSource),
        ]),
    ...(unreviewedCalls.length === 0
      ? []
      : [
          "",
          "Calls to functions without a review:",
          "",
          ...unreviewedCalls.map(
            ({ at, callee }) =>
              `- #${at} \`${callee === null ? "call_indirect" : `call ${callee}`}\`: ${(isStale ? undefined : review.calls?.[at]) ?? "not reviewed"}`,
          ),
        ]),
    "",
  ].join("\n");
};

const listOf = (items: ReadonlyArray<string>): string =>
  items.length === 1
    ? items[0]
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const isOrAre = (items: ReadonlyArray<string>): string =>
  items.length === 1 ? "is" : "are";

const log = (message: string): void => {
  // oxlint-disable-next-line eslint/no-console -- Print the listing.
  console.log(message);
};

/**
 * The reviewed functions of the pinned wasm. Each `sources` entry says why a
 * loaded value or call result is public or secret.
 */
export const reviewedFunctions: ReadonlyArray<ReviewedFunction> = [
  {
    name: "evolu_aes256_init",
    index: 74,
    sha256: "43bd79750e3b0d808608f05d6d34b014233af9a91f533494208a31fe78ffd848",
    summary:
      "The core's `evolu_aes256_init`, with `evolu_aes256_init_with` and `aes256_ct64_init` inlined: wasm has no AES instructions, so it records the `aes_ct64` table and calls `br_aes_ct64_cbcenc_init` and `br_aes_ct64_cbcdec_init`, then wipes the stack.",
  },
  {
    name: "evolu_aes256_cbc_encrypt",
    index: 75,
    sha256: "75b71b4ba261f6473907216ed31316750717ba98ead2552e3d714a4a9e5cdd71",
    summary:
      "The core's `evolu_aes256_cbc_encrypt`: refuses a partial block, calls the context's implementation and wipes the stack.",
    sources: {
      "13": {
        type: "Public",
        reason:
          "`aes->impl`, the table `evolu_aes256_init` records for every key, `aes_ct64` on wasm",
      },
      "14": {
        type: "Public",
        reason: "that table's `cbc_encrypt`, `aes256_ct64_cbc_encrypt`",
      },
    },
    calls: {
      "15": "`aes256_ct64_cbc_encrypt`, function 71, which is reviewed, since on wasm `evolu_aes256_init` records `aes_ct64`'s table alone",
    },
  },
  {
    name: "evolu_aes256_cbc_decrypt",
    index: 76,
    sha256: "2570dc694b930e1ce6efb4014e653c1c94f55b8994efec383b717fcfec04ca91",
    summary:
      "The core's `evolu_aes256_cbc_decrypt`: refuses a partial block, calls the context's implementation and wipes the stack.",
    sources: {
      "13": {
        type: "Public",
        reason:
          "`aes->impl`, the table `evolu_aes256_init` records for every key, `aes_ct64` on wasm",
      },
      "14": {
        type: "Public",
        reason: "that table's `cbc_decrypt`, `aes256_ct64_cbc_decrypt`",
      },
    },
    calls: {
      "15": "`aes256_ct64_cbc_decrypt`, function 72, which is reviewed, since on wasm `evolu_aes256_init` records `aes_ct64`'s table alone",
    },
  },
  {
    name: "aes256_ct64_init",
    index: 70,
    sha256: "23a4642a6fb08bcc111da1e5215ad0999413e8c03ba3b504afd78fdf111d2814",
    summary:
      "The core's `aes256_ct64_init`, the `aes_ct64` table's key setup, which calls `br_aes_ct64_cbcenc_init` and `br_aes_ct64_cbcdec_init`.",
  },
  {
    name: "aes256_ct64_cbc_encrypt",
    index: 71,
    sha256: "69636387bb4cbbd65b92d4f3ab01315ba4e318438b4dec087419af36882cbabc",
    summary:
      "The core's `aes256_ct64_cbc_encrypt`, which calls `br_aes_ct64_cbcenc_run`.",
  },
  {
    name: "aes256_ct64_cbc_decrypt",
    index: 72,
    sha256: "67cc96dd2fd435b75fd40908c49093182323c6a222c407b3a7b6cbcfa9a1375d",
    summary:
      "The core's `aes256_ct64_cbc_decrypt`, which calls `br_aes_ct64_cbcdec_run`.",
  },
  {
    name: "br_aes_ct64_cbcenc_init",
    index: 145,
    sha256: "38dae2d93ccf58ba9f442e3e5a088341a5c56955d223df24a83817ac21715ef6",
    summary:
      "BearSSL's `br_aes_ct64_cbcenc_init` (`aes_ct64_cbcenc.c`), which calls `br_aes_ct64_keysched`.",
  },
  {
    name: "br_aes_ct64_cbcdec_init",
    index: 143,
    sha256: "f04b24c4f55a6f58bb2f5cc5cede143d9fd77216572f7e173878688b38bc9de4",
    summary:
      "BearSSL's `br_aes_ct64_cbcdec_init` (`aes_ct64_cbcdec.c`), which calls `br_aes_ct64_keysched`.",
  },
  {
    name: "br_aes_ct64_keysched",
    index: 141,
    sha256: "15c0d9daa92fe9fdf5971b551276942f002eb91aafdfed1304cd98e1a19a6af7",
    summary:
      "BearSSL's AES key schedule, `br_aes_ct64_keysched` (`aes_ct64.c`), with `sub_word` inlined.",
  },
  {
    name: "br_aes_ct64_skey_expand",
    index: 142,
    sha256: "873ff91f9e4e151594093a0c7008bbe767bd29dee363805377cdcc3dcb08a195",
    summary:
      "BearSSL's `br_aes_ct64_skey_expand` (`aes_ct64.c`), which expands the stored round keys before each CBC run.",
  },
  {
    name: "br_aes_ct64_cbcenc_run",
    index: 146,
    sha256: "752a778e4fc7a582b5e7834d6218aa1034dd05eafb9ce4545cdf17af3df2aae3",
    summary:
      "BearSSL's CBC encryption, `br_aes_ct64_cbcenc_run` (`aes_ct64_cbcenc.c`), one block at a time, with Evolu's zero initialization of the state before each block.",
    sources: {
      "22": {
        type: "Public",
        reason: "`ctx->num_rounds`, 14 for every 256-bit key",
      },
      "102": {
        type: "Public",
        reason: "`ctx->num_rounds`, 14 for every 256-bit key",
      },
    },
  },
  {
    name: "br_aes_ct64_cbcdec_run",
    index: 144,
    sha256: "f7ec3e3d6d35f7bda5fc9259ff3df7622db7123adbce5ce1fbbe4ace0069407b",
    summary:
      "BearSSL's CBC decryption, `br_aes_ct64_cbcdec_run` (`aes_ct64_cbcdec.c`), four blocks at a time, with Evolu's zero initialization of the input words before each batch.",
    sources: {
      "22": {
        type: "Public",
        reason: "`ctx->num_rounds`, 14 for every 256-bit key",
      },
      "154": {
        type: "Public",
        reason: "`ctx->num_rounds`, 14 for every 256-bit key",
      },
    },
  },
  {
    name: "br_aes_ct64_bitslice_encrypt",
    index: 149,
    sha256: "37692815d6e39f553098c33138f4fb54543c149ca47c98fa912d3c23e75ae8d1",
    summary:
      "BearSSL's `br_aes_ct64_bitslice_encrypt` (`aes_ct64_enc.c`), with `add_round_key` and `mix_columns` inlined.",
  },
  {
    name: "br_aes_ct64_bitslice_decrypt",
    index: 147,
    sha256: "04cfc7b3f087fc0f5493fc40b897f7e0417980454c54d788f4e52965613aa241",
    summary:
      "BearSSL's `br_aes_ct64_bitslice_decrypt` (`aes_ct64_dec.c`), with `br_aes_ct64_bitslice_invSbox`, `add_round_key` and `inv_mix_columns` inlined.",
  },
  {
    name: "br_aes_ct64_bitslice_Sbox",
    index: 137,
    sha256: "306af368c4311f85951e77b29fcc46c663510b541051c51208c0132342d4f551",
    summary:
      "BearSSL's bitsliced S-box, `br_aes_ct64_bitslice_Sbox` (`aes_ct64.c`).",
  },
  {
    name: "br_aes_ct64_ortho",
    index: 138,
    sha256: "0d42a7f6a4970117f53916f6722cef59045579ce3e74810b96c79dee55344aae",
    summary:
      "BearSSL's `br_aes_ct64_ortho` (`aes_ct64.c`), which transposes the bitsliced state.",
  },
  {
    name: "br_aes_ct64_interleave_in",
    index: 139,
    sha256: "5c609ea722263dd1ad61fc84278de09482589f459a4c901d6c5feca2759a50eb",
    summary:
      "BearSSL's `br_aes_ct64_interleave_in` (`aes_ct64.c`), which spreads four words into two state words.",
  },
  {
    name: "br_aes_ct64_interleave_out",
    index: 140,
    sha256: "7cfb18b3c408d41adaf56aaa21b2669e3aef721950bda56cb7b5968ecae65a4b",
    summary:
      "BearSSL's `br_aes_ct64_interleave_out` (`aes_ct64.c`), which gathers two state words into four words.",
    secretParams: {
      "1": "`q0`, half of the state",
      "2": "`q1`, the other half",
    },
  },
  {
    name: "shift_rows",
    index: 150,
    sha256: "8bb923078a197d9f66061f8cb4f1badc01f7498bba528ac3f4acf8d9397a8fed",
    summary: "`shift_rows` of BearSSL's `aes_ct64_enc.c`.",
  },
  {
    name: "inv_shift_rows",
    index: 148,
    sha256: "9e3bf1eaf0610c3310443346eb9c7f05c88c8d54c01a755cb360b92eaa007755",
    summary: "`inv_shift_rows` of BearSSL's `aes_ct64_dec.c`.",
  },
  {
    name: "br_range_dec32le",
    index: 121,
    sha256: "ed91ed29d8e7cd96ba3ba862668f8ea6c2048201d5aa56003613d28c4dcc1509",
    summary:
      "BearSSL's `br_range_dec32le` (`dec32le.c`), which reads blocks, IVs and keys as little-endian words.",
  },
  {
    name: "br_range_enc32le",
    index: 124,
    sha256: "2db812acc4d29e59a3cd24cd7be782372b7a8071d2ef93fbfe2edf5672163fae",
    summary:
      "BearSSL's `br_range_enc32le` (`enc32le.c`), which writes blocks and IVs as little-endian words.",
  },
  {
    name: "sha512_blocks",
    index: 80,
    sha256: "edabe1d4cd35b4d6bea51cbdf2c6a548f22652c4e2993726be23d1a37d14dfb1",
    summary:
      "The core's `sha512_blocks`, with `sha512_blocks_bearssl`, `load64_be`, `store64_be` and `evolu_wipe` inlined: wasm has no SHA-512 instructions, so it runs BearSSL's compression through `br_sha512_set_state`, `br_sha512_update` and `br_sha512_state`, and wipes BearSSL's context.",
  },
  {
    name: "sha512_finish",
    index: 81,
    sha256: "e5ccc96ef656f58f15bf2aa48cb74a5acad2d2fd16ba998b3c980a30f80ff63b",
    summary:
      "The core's `sha512_finish`, with `store64_be` inlined: pads the message and compresses the last block or two.",
    sources: {
      "6": {
        type: "Public",
        reason: "`sha->size`, the number of bytes hashed, a public length",
      },
    },
  },
  {
    name: "br_sha384_update",
    index: 126,
    sha256: "25a25f06c41c837bfe894737c7bc977aa3a564a524d139703acaca1dbd67b225",
    summary:
      "BearSSL's `br_sha512_update`, an alias of `br_sha384_update` (`sha2big.c`), with `sha2big_update` inlined.",
    sources: {
      "3": {
        type: "Public",
        reason:
          "`cc->count`, the number of bytes hashed, 0 when `sha512_blocks` calls it",
      },
    },
  },
  {
    name: "sha2big_round",
    index: 127,
    sha256: "d8ca0181bfb0d1a752f72c786ddb416337867a1c68686fb55077a513d6b950f0",
    summary:
      "BearSSL's SHA-512 compression function, `sha2big_round` (`sha2big.c`).",
  },
  {
    name: "br_sha384_state",
    index: 128,
    sha256: "b5460a9e8bfe968eff14fbfa8b5a0f38d6a7cc8514957b18f426e92f50e7239a",
    summary:
      "BearSSL's `br_sha512_state`, an alias of `br_sha384_state` (`sha2big.c`).",
  },
  {
    name: "br_sha384_set_state",
    index: 129,
    sha256: "7edecca5f4650aa13bf78bd417567564b92870506f9e661fda544dbee26380ba",
    summary:
      "BearSSL's `br_sha512_set_state`, an alias of `br_sha384_set_state` (`sha2big.c`).",
  },
  {
    name: "br_range_dec64be",
    index: 122,
    sha256: "d6948c4ce76534d1fd5b53db50a53ec01968b69e6ee34793e78c818acd3b2e6a",
    summary:
      "BearSSL's `br_range_dec64be` (`dec64be.c`), which reads message blocks and states as big-endian words.",
  },
  {
    name: "br_range_enc64be",
    index: 125,
    sha256: "02037cc681db8b2ea6f6794dfb3ff5cafc3c23f558b23511123230c682cd3ee5",
    summary:
      "BearSSL's `br_range_enc64be` (`enc64be.c`), which writes states as big-endian words.",
  },
  {
    name: "evolu_hmac_sha512_key_init",
    index: 82,
    sha256: "acf48823f4b7fa54f3621547ff05c7bf6528c9a5c4faeeb40eacb37a4547c5e6",
    summary:
      "The core's `evolu_hmac_sha512_key_init`, with `evolu_sha512_digest` inlined for a key longer than a block.",
  },
  {
    name: "evolu_hmac_sha512_init",
    index: 84,
    sha256: "695331ea999563abeb321b470215c4c5b6e9c1df3249f67bef21616841a9a83b",
    summary:
      "The core's `evolu_hmac_sha512_init`, which copies the key's two states.",
  },
  {
    name: "evolu_hmac_sha512_update",
    index: 85,
    sha256: "60c4c653821dfb45adf5bdffaca74b91bd320cced31ad0418b1a7bb4e2b634af",
    summary:
      "The core's `evolu_hmac_sha512_update`, with `evolu_sha512_update` inlined.",
    sources: {
      "7": {
        type: "Public",
        reason:
          "`mac->inner.size`, the number of bytes hashed, a public length",
      },
    },
  },
  {
    name: "evolu_hmac_sha512_final",
    index: 86,
    sha256: "55a63e5b779dd3fb66c6ed390b3e0966e45448f8cb2007f83c6d68cdfe804448",
    summary:
      "The core's `evolu_hmac_sha512_final`, with `hmac_sha512_finish` and `evolu_wipe` inlined.",
  },
  {
    name: "evolu_hmac_sha512_key_wipe",
    index: 83,
    sha256: "2fd4d3f6c94bfa1c8288bbf0905805903af7efa23fd39741e50d7ed85a6092bd",
    summary:
      "The core's `evolu_hmac_sha512_key_wipe`, with `evolu_wipe` inlined.",
  },
  {
    name: "evolu_pbkdf2_sha512",
    index: 87,
    sha256: "2443d52d156893f44d6ab9789945360ce1bd347e2b788285f0f6ff2f079fcbdc",
    summary:
      "The core's `evolu_pbkdf2_sha512`, with `evolu_hmac_sha512_init`, `evolu_hmac_sha512_update`, `hmac_sha512_finish` and the wipes inlined.",
    sources: {
      "183": {
        type: "Public",
        reason:
          "`mac.inner.size`, the number of bytes the inner hash has taken, a public length",
      },
    },
  },
  {
    name: "derive_hmac_key",
    index: 93,
    sha256: "267cd8850fe9cd6825a65dbf8d3ea921c66b6753f67ab0608bfb86ac9f9bc4fe",
    summary:
      "`derive_hmac_key` of the core's `evolu_page.c`, which masks the salt and derives the HMAC key with two iterations of PBKDF2.",
  },
  {
    name: "evolu_constant_time_equal",
    index: 68,
    sha256: "75117cb62715f11eaffd11e2a314f10aad3aaa9ff56eb01eb2f04cac0f2d1165",
    summary:
      "The tag comparison, the core's `evolu_constant_time_equal`: it ORs the XOR of each pair of bytes into a volatile byte on the stack and returns `(difference - 1) >> 31`, without a branch.",
  },
  {
    name: "is_page1_authentic",
    index: 100,
    sha256: "de318807eeafb97618f53cc804c1607e9eaab3302ca1331e83970b79e9d0b80c",
    summary:
      "`is_page1_authentic` of `evolu_page.c`, with `stored_page_size`, `encrypted_start` and `compute_hmac` inlined.",
    sources: {
      "24": {
        type: "Public",
        reason:
          "byte 20 of page 1 as stored, which the default layout keeps in the clear",
      },
      "30": {
        type: "Public",
        reason:
          "byte 17 of page 1 as stored, the page size's low byte, which the default layout keeps in the clear",
      },
      "32": {
        type: "Public",
        reason:
          "byte 16 of page 1 as stored, the page size's high byte, which the default layout keeps in the clear",
      },
    },
  },
  {
    name: "authenticate",
    index: 94,
    sha256: "dee283787b132edf943c912c9ea58e79c1d70b06160d524347a37e501e9bfafc",
    summary:
      "`authenticate` of `evolu_page.c`, which calls `is_page1_authentic` for page 1 in the codec's layout and in the default one, and has it inlined where it tries SQLCipher's, and has `compute_hmac` inlined for the other pages.",
    sources: {
      "20": {
        type: "Public",
        reason:
          "`codec->layout`, page 1's layout, which the file shows: the default layout stores bytes 16 to 23 in the clear",
      },
      "79": {
        type: "Public",
        reason:
          "`is_page1_authentic`'s result, whether page 1 authenticates in the default layout, which the read's failure reveals",
      },
      "85": {
        type: "Public",
        reason: "`codec->flags`, set when the codec is created",
      },
    },
  },
  {
    name: "evolu_page_decrypt",
    index: 92,
    sha256: "f84688fc881ee81a5490e90de08e1c32d0a87494fe21dcb2a23f04e3c220cfdc",
    summary:
      "The core's `evolu_page_decrypt`, with `decrypt_page` and `evolu_page_is_size` inlined.",
    sources: {
      "18": {
        type: "Public",
        reason:
          "`evolu_dit_begin`'s result, always 0 on wasm, which has no DIT",
      },
      "39": {
        type: "Public",
        reason: "`codec->has_salt`, whether the codec has a salt yet",
      },
      "52": {
        type: "Public",
        reason: "half of `codec->salt`, which page 1 stores in the clear",
      },
      "54": {
        type: "Public",
        reason:
          "half of the page's first 16 bytes, page 1's salt as stored in the clear",
      },
      "57": {
        type: "Public",
        reason: "half of `codec->salt`, which page 1 stores in the clear",
      },
      "59": {
        type: "Public",
        reason:
          "half of the page's first 16 bytes, page 1's salt as stored in the clear",
      },
      "87": {
        type: "Public",
        reason:
          "`authenticate`'s result, whether the page's HMAC matches, which the read's failure reveals",
      },
      "117": {
        type: "Public",
        reason: "the layout `authenticate` found, which the file shows",
      },
      "134": {
        type: "Public",
        reason:
          "`authenticate`'s result, whether the page's HMAC matches, which the read's failure reveals",
      },
      "140": {
        type: "Public",
        reason: "the layout `authenticate` found, which the file shows",
      },
    },
    calls: {
      "18": "`evolu_dit_begin`, which returns 0 on wasm, which has no DIT",
      "164": "`evolu_dit_end`, which does nothing on wasm, which has no DIT",
    },
  },
  {
    name: "evolu_page_decrypt_with_salt",
    index: 96,
    sha256: "42b46d5e98374862bbec6d456d6d0e9c7732093f9efaa2e33fd781d947d1452f",
    summary:
      "The core's `evolu_page_decrypt_with_salt`, with `decrypt_page_with_salt` and `evolu_page_is_size` inlined.",
    sources: {
      "18": {
        type: "Public",
        reason:
          "`evolu_dit_begin`'s result, always 0 on wasm, which has no DIT",
      },
      "37": {
        type: "Public",
        reason:
          "half of the page's first 16 bytes, page 1's salt as stored in the clear",
      },
      "39": {
        type: "Public",
        reason:
          "half of the salt to try, read from a database or journal that stores it in the clear",
      },
      "42": {
        type: "Public",
        reason:
          "half of the page's first 16 bytes, page 1's salt as stored in the clear",
      },
      "44": {
        type: "Public",
        reason:
          "half of the salt to try, read from a database or journal that stores it in the clear",
      },
      "66": {
        type: "Public",
        reason:
          "`authenticate`'s result, whether the page's HMAC matches, which the read's failure reveals",
      },
      "75": {
        type: "Public",
        reason: "the layout `authenticate` found, which the file shows",
      },
    },
    calls: {
      "18": "`evolu_dit_begin`, which returns 0 on wasm, which has no DIT",
      "82": "`evolu_dit_end`, which does nothing on wasm, which has no DIT",
    },
  },
  {
    name: "decrypt_authentic",
    index: 95,
    sha256: "2f3d98c9dcc17fa0b6518d1f32c65b5fac995e097cc49179f00450254d6759c6",
    summary:
      "`decrypt_authentic` of `evolu_page.c`, with `decrypt_cbc_cs3` and `encrypted_start` inlined.",
  },
  {
    name: "evolu_page_encrypt",
    index: 91,
    sha256: "d51b1fc10e1e070da0652a7e29930ff6d4eeaa265d9fff497618b362f7c95fd0",
    summary:
      "The core's `evolu_page_encrypt`, with `encrypt_page`, `derive_hmac_key`, `adopt_salt`, `encrypt_cbc_cs3` and `compute_hmac` inlined.",
    sources: {
      "18": {
        type: "Public",
        reason:
          "`evolu_dit_begin`'s result, always 0 on wasm, which has no DIT",
      },
      "41": {
        type: "Public",
        reason:
          "byte 20 of the page 1 SQLite writes, its reserved bytes per page, which must be 80",
      },
      "49": {
        type: "Public",
        reason:
          "byte 17 of the page 1 SQLite writes, the low byte of its page size, which must equal the size written",
      },
      "51": {
        type: "Public",
        reason:
          "byte 16 of the page 1 SQLite writes, the high byte of its page size",
      },
      "67": {
        type: "Public",
        reason: "`codec->has_salt`, whether the codec has a salt yet",
      },
      "72": {
        type: "Public",
        reason:
          "`evolu_random_bytes`'s status for the salt, which fails only when the platform's generator does",
      },
      "220": {
        type: "Public",
        reason: "`evolu_random_bytes`'s status for the IV",
      },
      "224": {
        type: "Public",
        reason:
          "`codec->layout`, page 1's layout, which the file shows: the default layout stores bytes 16 to 23 in the clear",
      },
    },
    calls: {
      "18": "`evolu_dit_begin`, which returns 0 on wasm, which has no DIT",
      "72": "`evolu_random_bytes` for the salt, which fills it from the platform's generator",
      "220": "`evolu_random_bytes` for the IV",
      "461": "`evolu_dit_end`, which does nothing on wasm, which has no DIT",
    },
  },
  {
    name: "evolu_page_codec_create",
    index: 89,
    sha256: "2cf62baa12abcba4cf8a2266bd142af3f01877c853fb8e00fc678ce3102b89df",
    summary:
      "The core's `evolu_page_codec_create`, with `create_codec` inlined: it copies the key and expands it.",
    sources: {
      "1": {
        type: "Public",
        reason:
          "`evolu_dit_begin`'s result, always 0 on wasm, which has no DIT",
      },
      "5": {
        type: "Public",
        reason: "`evolu_calloc`'s result, the codec's address or NULL",
      },
    },
    calls: {
      "1": "`evolu_dit_begin`, which returns 0 on wasm, which has no DIT",
      "5": "`evolu_calloc`, which allocates the codec before the key is copied into it",
      "34": "`evolu_dit_end`, which does nothing on wasm, which has no DIT",
    },
  },
  {
    name: "evolu_page_use_salt",
    index: 97,
    sha256: "0e2d57fea294c4ffd072c1f235aa34cc7048dbd6153e8b80c31c2133718d69d7",
    summary: "The core's `evolu_page_use_salt`, with `adopt_salt` inlined.",
    sources: {
      "20": {
        type: "Public",
        reason: "`codec->has_salt`, whether the codec has a salt yet",
      },
      "23": {
        type: "Public",
        reason: "half of `codec->salt`, which page 1 stores in the clear",
      },
      "25": {
        type: "Public",
        reason:
          "half of the salt to use, read from a database or journal that stores it in the clear",
      },
      "28": {
        type: "Public",
        reason: "half of `codec->salt`, which page 1 stores in the clear",
      },
      "30": {
        type: "Public",
        reason:
          "half of the salt to use, read from a database or journal that stores it in the clear",
      },
      "36": {
        type: "Public",
        reason:
          "`evolu_dit_begin`'s result, always 0 on wasm, which has no DIT",
      },
    },
    calls: {
      "36": "`evolu_dit_begin`, which returns 0 on wasm, which has no DIT",
      "62": "`evolu_dit_end`, which does nothing on wasm, which has no DIT",
    },
  },
  {
    name: "evolu_wipe",
    index: 66,
    sha256: "1f5643b6b0f72aafe8f12b8db90450f0073f6e6c2ef46dc857963f69c32bf35d",
    summary:
      "The core's `evolu_wipe`, which zeroes keys and states through a volatile pointer.",
  },
  {
    name: "evolu_wipe_stack",
    index: 67,
    sha256: "ca8d85593b29dcad7f0e32f592d7ed8c407d219bffc1aef7a55275f19ddab213",
    summary:
      "The core's `evolu_wipe_stack`, which zeroes 4 KiB of the stack below its caller.",
  },
];

if (import.meta.main)
  process.exitCode = await runConstantTimeCli(
    process.argv.slice(2),
    reviewedFunctions,
  );
