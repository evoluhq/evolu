import nodeAssert from "node:assert/strict";
import { test } from "node:test";
import { runInThisContext } from "node:vm";

test("createNativeConsoleOutput uses the global object console when lexically shadowed", async () => {
  const consoleDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "console",
  );
  // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Capture the global object property before installing the distinct lexical shadow.
  const nativeConsole = globalThis.console;
  const globalCalls: Array<ReadonlyArray<unknown>> = [];
  const lexicalCalls: Array<ReadonlyArray<unknown>> = [];

  const globalConsole = Object.create(nativeConsole) as typeof nativeConsole;
  Object.defineProperty(globalConsole, "info", {
    value: (...args: ReadonlyArray<unknown>) => {
      globalCalls.push(args);
    },
  });

  const lexicalConsole = Object.create(nativeConsole) as typeof nativeConsole;
  Object.defineProperty(lexicalConsole, "info", {
    value: (...args: ReadonlyArray<unknown>) => {
      lexicalCalls.push(args);
    },
  });

  Object.defineProperties(globalThis, {
    console: {
      configurable: true,
      writable: true,
      value: globalConsole,
    },
    __evoluConsoleLexicalShadow: {
      configurable: true,
      value: lexicalConsole,
    },
  });

  let lexicalBindingInstalled = false;

  try {
    runInThisContext(`
      let console = globalThis.__evoluConsoleLexicalShadow;
    `);
    lexicalBindingInstalled = true;
    Reflect.deleteProperty(globalThis, "__evoluConsoleLexicalShadow");

    const { createNativeConsoleOutput } =
      await import("../../../../packages/common/src/Console.ts");
    const output = createNativeConsoleOutput();
    output.write({ method: "info", path: [], args: ["hello"] });

    nodeAssert.deepEqual(
      { globalCalls, lexicalCalls },
      { globalCalls: [["hello"]], lexicalCalls: [] },
    );
  } finally {
    if (consoleDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, "console");
    } else {
      Object.defineProperty(globalThis, "console", consoleDescriptor);
    }

    if (lexicalBindingInstalled) {
      runInThisContext("console = globalThis.console;");
    }
  }
});
