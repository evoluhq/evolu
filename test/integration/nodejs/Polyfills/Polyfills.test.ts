import nodeAssert from "node:assert/strict";
import { test } from "node:test";
import { runInThisContext } from "node:vm";

const trackedGlobalKeys = [
  "Symbol",
  "DisposableStack",
  "AsyncDisposableStack",
  "SuppressedError",
] as const;

test("installPolyfills uses global object constructors when globals are lexically shadowed", async () => {
  const descriptors = Object.fromEntries(
    trackedGlobalKeys.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  ) as Readonly<
    Record<(typeof trackedGlobalKeys)[number], PropertyDescriptor | undefined>
  >;

  const nativeSymbol = Symbol;
  const globalSymbol = ((description?: string) =>
    nativeSymbol(description)) as SymbolConstructor;
  Object.setPrototypeOf(globalSymbol, nativeSymbol);

  const lexicalSymbol = ((description?: string) =>
    // oxlint-disable-next-line evolu/no-unnecessary-global-this -- This lexical shadow deliberately delegates to the distinct global object property.
    globalThis.Symbol(description)) as SymbolConstructor;
  Object.setPrototypeOf(lexicalSymbol, globalSymbol);

  class LexicalSuppressedError extends Error {}

  Object.defineProperties(globalThis, {
    Symbol: {
      configurable: true,
      writable: true,
      value: globalSymbol,
    },
    DisposableStack: {
      configurable: true,
      writable: true,
      value: undefined,
    },
    AsyncDisposableStack: {
      configurable: true,
      writable: true,
      value: undefined,
    },
    SuppressedError: {
      configurable: true,
      writable: true,
      value: undefined,
    },
    __evoluPolyfillsLexicalSymbol: {
      configurable: true,
      value: lexicalSymbol,
    },
    __evoluPolyfillsLexicalSuppressedError: {
      configurable: true,
      value: LexicalSuppressedError,
    },
  });

  let lexicalBindingsInstalled = false;

  try {
    runInThisContext(`
      let Symbol = globalThis.__evoluPolyfillsLexicalSymbol;
      let SuppressedError = globalThis.__evoluPolyfillsLexicalSuppressedError;
    `);
    lexicalBindingsInstalled = true;

    Reflect.deleteProperty(globalThis, "__evoluPolyfillsLexicalSymbol");
    Reflect.deleteProperty(
      globalThis,
      "__evoluPolyfillsLexicalSuppressedError",
    );

    const { installPolyfills } =
      await import("../../../../packages/common/src/Polyfills.ts");
    installPolyfills();

    const failures: Array<string> = [];
    if (
      typeof Object.getOwnPropertyDescriptor(globalSymbol, "dispose")?.value !==
        "symbol" ||
      typeof Object.getOwnPropertyDescriptor(globalSymbol, "asyncDispose")
        ?.value !== "symbol"
    ) {
      failures.push("Symbol statics were installed on the lexical shadow");
    }

    const stack = new DisposableStack();
    stack.defer(() => {
      throw new Error("first");
    });
    stack.defer(() => {
      throw new Error("second");
    });

    let thrown: unknown;
    try {
      stack.dispose();
    } catch (error) {
      thrown = error;
    }

    if (
      typeof globalThis.SuppressedError !== "function" ||
      // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Compare against the installed global constructor rather than its lexical shadow.
      !(thrown instanceof globalThis.SuppressedError)
    ) {
      failures.push("The lexical SuppressedError shadow was constructed");
    }

    nodeAssert.deepEqual(failures, []);
  } finally {
    for (const key of trackedGlobalKeys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, key);
      } else {
        Object.defineProperty(globalThis, key, descriptor);
      }
    }

    if (lexicalBindingsInstalled) {
      runInThisContext(`
        Symbol = globalThis.Symbol;
        SuppressedError = globalThis.SuppressedError;
      `);
    }
  }
});
