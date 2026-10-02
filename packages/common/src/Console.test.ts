import { describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertLength,
  assertSame,
  assertTrue,
} from "./Assert.ts";

import {
  createConsole,
  createConsoleArrayOutput,
  createConsoleFormatter,
  createConsoleStoreOutput,
  createMultiOutput,
  createNativeConsoleOutput,
  testCreateConsole,
  type ConsoleEntry,
  type ConsoleOutput,
} from "./Console.ts";
import { testCreateTime, type Millis } from "./Time.ts";
import { assertType, String } from "./Type.ts";

const createTimeDep = (startAt?: Millis) => ({
  time: testCreateTime(startAt != null ? { startAt } : undefined),
});

const createTestOutput = (): ConsoleOutput & {
  entries: Array<{
    entry: ConsoleEntry;
    formattedArgs: ReadonlyArray<unknown>;
  }>;
} => {
  const entries: Array<{
    entry: ConsoleEntry;
    formattedArgs: ReadonlyArray<unknown>;
  }> = [];
  return {
    entries,
    write: (entry, formatter) => {
      entries.push({
        entry,
        formattedArgs: formatter ? formatter(entry) : entry.args,
      });
    },
  };
};

describe("createConsole", () => {
  it("logs at default level (log)", () => {
    const output = createTestOutput();
    const console = createConsole({ output });

    console.trace("trace");
    console.debug("debug");
    console.log("log");
    console.info("info");
    console.warn("warn");
    console.error("error");

    assertEqual(
      output.entries.map((e) => e.entry.method),
      ["log", "info", "warn", "error"],
    );
  });

  it("respects level filtering", () => {
    const output = createTestOutput();
    const console = createConsole({
      output,
      level: "warn",
    });

    console.debug("debug");
    console.log("log");
    console.info("info");
    console.warn("warn");
    console.error("error");

    assertEqual(
      output.entries.map((e) => e.entry.method),
      ["warn", "error"],
    );
  });

  it("silent level disables all logging", () => {
    const output = createTestOutput();
    const console = createConsole({
      output,
      level: "silent",
    });

    console.trace("trace");
    console.debug("debug");
    console.log("log");
    console.info("info");
    console.warn("warn");
    console.error("error");

    assertLength(output.entries, 0);
  });

  it("level can be changed at runtime", () => {
    const output = createTestOutput();
    const console = createConsole({ output });

    console.debug("before");
    console.setLevel("debug");
    console.debug("after");

    assertEqual(
      output.entries.map((e) => e.entry.args[0]),
      ["after"],
    );
  });

  it("child without own level follows its parent's level", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const grandchild = console.child("relay").child("db");

    grandchild.debug("ignored");
    console.setLevel("debug");
    grandchild.debug("logged");

    assertEqual(grandchild.getLevel(), "debug");
    assertFalse(grandchild.hasOwnLevel());
    assertEqual(
      output.entries.map((e) => e.entry.args[0]),
      ["logged"],
    );
  });

  it("grandchild follows its parent's own level", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const relay = console.child("relay");
    const db = relay.child("db");

    relay.setLevel("debug");
    db.debug("logged");
    assertEqual(db.getLevel(), "debug");

    relay.setLevel(null);
    assertEqual(db.getLevel(), "info");
    assertEqual(
      output.entries.map((e) => e.entry.args[0]),
      ["logged"],
    );
  });

  it("child can override level independently", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const child = console.child("relay");

    child.setLevel("debug");
    console.setLevel("error");
    child.debug("logged");
    console.warn("ignored");

    assertEqual(
      output.entries.map((e) => e.entry.args[0]),
      ["logged"],
    );
  });

  it("setLevel(null) reverts to inherited level", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const child = console.child("relay");

    child.setLevel("debug");
    assertTrue(child.hasOwnLevel());

    child.setLevel(null);
    assertFalse(child.hasOwnLevel());
    assertEqual(child.getLevel(), "info");

    console.setLevel("warn");
    assertEqual(child.getLevel(), "warn");
  });

  it("child adds path", () => {
    const output = createTestOutput();
    const console = createConsole({ output });
    const child = console.child("relay").child("db");

    child.info("message");

    assertEqual(output.entries[0].entry.path, ["relay", "db"]);
  });

  it("child inherits formatter", () => {
    const output = createTestOutput();
    const formatter = (entry: ConsoleEntry) => ["prefix", ...entry.args];
    const console = createConsole({
      output,
      formatter,
    });
    const child = console.child("relay");

    child.info("message");

    assertEqual(output.entries[0].formattedArgs, ["prefix", "message"]);
  });

  it("write filters replayed entries by level", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });

    console.write({ method: "debug", path: ["worker"], args: ["dropped"] });
    console.write({ method: "error", path: ["worker"], args: ["replayed"] });

    assertEqual(
      output.entries.map((e) => e.entry.args[0]),
      ["replayed"],
    );
  });

  it("write passes formatter to output", () => {
    const output = createTestOutput();
    const formatter = (entry: ConsoleEntry) => ["fmt", ...entry.args];
    const console = createConsole({ output, formatter });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["msg"],
    };
    console.write(entry);

    assertEqual(output.entries[0].formattedArgs, ["fmt", "msg"]);
  });
});

describe("createNativeConsoleOutput", () => {
  // oxlint-disable-next-line evolu/no-unnecessary-global-this -- These tests explicitly observe the global object console used by the native output.
  const nativeConsole = globalThis.console;

  it("calls the native console method with its console receiver", (t) => {
    const logSpy = t.mock.method(nativeConsole, "info", () => undefined);
    const output = createNativeConsoleOutput();

    output.write({
      method: "info",
      path: [],
      args: ["hello", "world"],
    });

    assertEqual(logSpy.mock.calls[0].arguments, ["hello", "world"]);
    assertSame(logSpy.mock.calls[0].this, nativeConsole);
  });

  it("writes trace entries with native debug", (t) => {
    const debugSpy = t.mock.method(nativeConsole, "debug", () => undefined);
    const traceSpy = t.mock.method(nativeConsole, "trace", () => undefined);
    const output = createNativeConsoleOutput();

    output.write({ method: "trace", path: [], args: ["query"] });

    assertEqual(debugSpy.mock.calls[0].arguments, ["query"]);
    assertSame(debugSpy.mock.calls[0].this, nativeConsole);
    assertLength(traceSpy.mock.calls, 0);
  });

  it("applies formatter", (t) => {
    const logSpy = t.mock.method(nativeConsole, "info", () => undefined);
    const output = createNativeConsoleOutput();
    const formatter = (entry: ConsoleEntry) => ["prefix", ...entry.args];

    output.write(
      {
        method: "info",
        path: [],
        args: ["message"],
      },
      formatter,
    );

    assertEqual(logSpy.mock.calls[0].arguments, ["prefix", "message"]);
  });
});

describe("createConsoleFormatter", () => {
  it("uses default time dep when not provided", () => {
    const formatter = createConsoleFormatter()({
      timestampFormat: "relative",
    });
    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    const result = formatter(entry);

    // Should have a relative timestamp prefix
    assertLength(result, 2);
    assertType(String, result[0]);
    assertTrue(/^\+\d+\.\d{3}s$/u.test(result[0]));
    assertEqual(result[1], "message");
  });

  it("formats path", () => {
    const formatter = createConsoleFormatter(createTimeDep())();
    const entry: ConsoleEntry = {
      method: "info",
      path: ["relay", "db"],
      args: ["message"],
    };

    const result = formatter(entry);

    assertEqual(result, ["[relay] [db]", "message"]);
  });

  it("with no path returns args unchanged", () => {
    const formatter = createConsoleFormatter(createTimeDep())();
    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message", 123],
    };

    const result = formatter(entry);

    assertEqual(result, ["message", 123]);
  });

  it("relative timestamp", () => {
    const time = testCreateTime({ startAt: 1000 as Millis });
    const formatter = createConsoleFormatter({ time })({
      timestampFormat: "relative",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["first"],
    };

    const result1 = formatter(entry);
    time.advance("1.5s");
    const result2 = formatter({ ...entry, args: ["second"] });

    assertEqual(result1, ["+0.000s", "first"]);
    assertEqual(result2, ["+1.500s", "second"]);
  });

  it("relative timestamp with custom start time", () => {
    const time = testCreateTime({ startAt: 1500 as Millis });
    const formatter = createConsoleFormatter({ time })({
      timestampFormat: "relative",
      startTime: 500 as Millis,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    const result = formatter(entry);

    assertEqual(result, ["+1.000s", "message"]);
  });

  it("iso timestamp", () => {
    const time = testCreateTime({
      startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 123) as Millis,
    });
    const formatter = createConsoleFormatter({ time })({
      timestampFormat: "iso",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    const result = formatter(entry);

    assertEqual(result, ["2026-01-28T14:30:00.123Z", "message"]);
  });

  it("absolute timestamp", () => {
    const time = testCreateTime({
      startAt: new Date(2026, 0, 28, 14, 30, 15, 123).getTime() as Millis,
    });
    const formatter = createConsoleFormatter({ time })({
      timestampFormat: "absolute",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    assertEqual(formatter(entry), ["14:30:15.123", "message"]);
  });

  it("relative timestamp is never negative", () => {
    const time = testCreateTime({ startAt: 1000 as Millis });
    const formatter = createConsoleFormatter({ time })({
      timestampFormat: "relative",
      startTime: 1500 as Millis,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    assertEqual(formatter(entry), ["+0.000s", "message"]);
  });

  it("combines timestamp and path", () => {
    const formatter = createConsoleFormatter(createTimeDep())({
      timestampFormat: "relative",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: ["relay"],
      args: ["message"],
    };

    const result = formatter(entry);

    assertEqual(result, ["+0.000s [relay]", "message"]);
  });
});

describe("createConsoleStoreOutput", () => {
  it("entry starts as null", () => {
    const output = createConsoleStoreOutput();
    assertSame(output.entry.get(), null);
  });

  it("entry updates on write", () => {
    const output = createConsoleStoreOutput();
    const console = createConsole({ output });
    console.info("hello");
    assertEqual(output.entry.get(), {
      method: "info",
      path: [],
      args: ["hello"],
    });
  });

  it("entry notifies subscribers", () => {
    const output = createConsoleStoreOutput();
    const console = createConsole({ output });
    const received: Array<ConsoleEntry | null> = [];
    output.entry.subscribe(() => {
      received.push(output.entry.get());
    });

    console.warn("one");
    console.error("two");

    assertEqual(received, [
      { method: "warn", path: [], args: ["one"] },
      { method: "error", path: [], args: ["two"] },
    ]);
  });

  it("captures child entries", () => {
    const output = createConsoleStoreOutput();
    const console = createConsole({ output });
    const child = console.child("db");
    const received: Array<ConsoleEntry | null> = [];
    output.entry.subscribe(() => {
      received.push(output.entry.get());
    });

    child.info("from child");

    assertEqual(received, [
      { method: "info", path: ["db"], args: ["from child"] },
    ]);
  });

  it("skips filtered entries", () => {
    const output = createConsoleStoreOutput();
    const console = createConsole({ output, level: "warn" });
    console.debug("ignored");
    assertSame(output.entry.get(), null);
    console.warn("logged");
    assertEqual(output.entry.get()?.method, "warn");
  });
});

describe("createConsoleArrayOutput", () => {
  it("captures entries to array", () => {
    const entries: Array<ConsoleEntry> = [];
    const output = createConsoleArrayOutput(entries);

    output.write({
      method: "info",
      path: ["relay"],
      args: ["message", 123],
    });

    assertEqual(entries, [
      {
        method: "info",
        path: ["relay"],
        args: ["message", 123],
      },
    ]);
  });

  it("works with createConsole", () => {
    const entries: Array<ConsoleEntry> = [];
    const output = createConsoleArrayOutput(entries);
    const console = createConsole({ output });

    console.info("hello");
    console.warn("world");

    assertEqual(
      entries.map((e) => e.method),
      ["info", "warn"],
    );
    assertEqual(
      entries.map((e) => e.args[0]),
      ["hello", "world"],
    );
  });
});

describe("createMultiOutput", () => {
  it("writes to all outputs", () => {
    const entries1: Array<ConsoleEntry> = [];
    const entries2: Array<ConsoleEntry> = [];
    const output = createMultiOutput([
      createConsoleArrayOutput(entries1),
      createConsoleArrayOutput(entries2),
    ]);
    const console = createConsole({ output });

    console.info("hello");

    assertLength(entries1, 1);
    assertLength(entries2, 1);
    assertEqual(entries1[0], entries2[0]);
  });

  it("passes the formatter to each output", () => {
    const first = createTestOutput();
    const second = createTestOutput();
    const console = createConsole({
      output: createMultiOutput([first, second]),
      formatter: (entry) => ["fmt", ...entry.args],
    });

    console.info("msg");

    assertEqual(first.entries[0].formattedArgs, ["fmt", "msg"]);
    assertEqual(second.entries[0].formattedArgs, ["fmt", "msg"]);
  });
});

describe("testCreateConsole", () => {
  it("captures entries", () => {
    const console = testCreateConsole();

    console.info("first");
    console.info("second");

    assertEqual(console.getEntriesSnapshot(), [
      { method: "info", path: [], args: ["first"] },
      { method: "info", path: [], args: ["second"] },
    ]);
  });

  it("defaults to trace level (logs everything)", () => {
    const console = testCreateConsole();

    console.trace("trace");
    console.debug("debug");
    console.log("log");
    console.info("info");
    console.warn("warn");
    console.error("error");

    assertEqual(
      console.getEntriesSnapshot().map((e) => e.method),
      ["trace", "debug", "log", "info", "warn", "error"],
    );
  });

  it("respects configured level", () => {
    const console = testCreateConsole({ level: "warn" });

    console.debug("ignored");
    console.info("ignored");
    console.warn("logged");
    console.error("logged");

    assertEqual(
      console.getEntriesSnapshot().map((e) => e.method),
      ["warn", "error"],
    );
  });

  it("getEntriesSnapshot clears entries", () => {
    const console = testCreateConsole();

    console.info("first");
    assertLength(console.getEntriesSnapshot(), 1);
    assertLength(console.getEntriesSnapshot(), 0);
  });

  it("clearEntries clears without returning", () => {
    const console = testCreateConsole();

    console.info("message");
    console.clearEntries();

    assertLength(console.getEntriesSnapshot(), 0);
  });

  it("child adds path", () => {
    const console = testCreateConsole();
    const child = console.child("relay").child("db");

    child.info("message");

    assertEqual(console.getEntriesSnapshot()[0].path, ["relay", "db"]);
  });
});
