import { describe, expect, test, vi } from "vitest";
import {
  createConsole,
  createConsoleArrayOutput,
  createConsoleEntryFormatter,
  createNativeConsoleOutput,
  testCreateConsole,
  type ConsoleEntry,
  type ConsoleOutput,
} from "../src/Console.js";
import { testCreateTime, type Millis } from "../src/Time.js";

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
    write: (entry, formatEntry) => {
      entries.push({
        entry,
        formattedArgs: formatEntry ? formatEntry(entry) : entry.args,
      });
    },
  };
};

describe("createConsole", () => {
  test("logs at default level (log)", () => {
    const output = createTestOutput();
    const console = createConsole({ output });

    console.trace("trace");
    console.debug("debug");
    console.log("log");
    console.info("info");
    console.warn("warn");
    console.error("error");

    expect(output.entries.map((e) => e.entry.method)).toEqual([
      "log",
      "info",
      "warn",
      "error",
    ]);
  });

  test("respects level filtering", () => {
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

    expect(output.entries.map((e) => e.entry.method)).toEqual([
      "warn",
      "error",
    ]);
  });

  test("silent level disables all logging", () => {
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

    expect(output.entries).toHaveLength(0);
  });

  test("level can be changed at runtime", () => {
    const output = createTestOutput();
    const console = createConsole({ output });

    console.debug("before");
    console.setLevel("debug");
    console.debug("after");

    expect(output.entries.map((e) => e.entry.args[0])).toEqual(["after"]);
  });

  test("child inherits level at creation (static)", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const child = console.child("relay");

    // Child inherits "info" level
    child.debug("ignored");
    child.info("logged");

    // Parent change doesn't affect child (static inheritance)
    console.setLevel("debug");
    child.debug("still ignored");

    expect(output.entries.map((e) => e.entry.args[0])).toEqual(["logged"]);
  });

  test("child can override level independently", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const child = console.child("relay");

    child.setLevel("debug");
    child.debug("logged");
    console.debug("ignored"); // parent still at "info"

    expect(output.entries.map((e) => e.entry.args[0])).toEqual(["logged"]);
  });

  test("setLevel(null) reverts to inherited level", () => {
    const output = createTestOutput();
    const console = createConsole({ output, level: "info" });
    const child = console.child("relay");

    child.setLevel("debug");
    expect(child.hasOwnLevel()).toBe(true);

    child.setLevel(null);
    expect(child.hasOwnLevel()).toBe(false);
    expect(child.getLevel()).toBe("info");
  });

  test("child adds path", () => {
    const output = createTestOutput();
    const console = createConsole({ output });
    const child = console.child("relay").child("db");

    child.info("message");

    expect(output.entries[0].entry.path).toEqual(["relay", "db"]);
  });

  test("child inherits formatEntry", () => {
    const output = createTestOutput();
    const formatEntry = (entry: ConsoleEntry) => ["prefix", ...entry.args];
    const console = createConsole({
      output,
      formatEntry,
    });
    const child = console.child("relay");

    child.info("message");

    expect(output.entries[0].formattedArgs).toEqual(["prefix", "message"]);
  });

  test("debug-level methods use debug level", () => {
    const output = createTestOutput();
    const console = createConsole({
      output,
      level: "log",
    });

    console.time("timer");
    console.timeLog("timer");
    console.timeEnd("timer");
    console.dir({ foo: 1 });
    console.table([1, 2, 3]);
    console.count("counter");
    console.countReset("counter");

    expect(output.entries).toHaveLength(0);

    console.setLevel("debug");

    console.time("timer");
    console.dir({ foo: 1 });

    expect(output.entries.map((e) => e.entry.method)).toEqual(["time", "dir"]);
  });

  test("debug-level methods skip formatter", () => {
    const output = createTestOutput();
    const formatEntry = vi.fn((entry: ConsoleEntry) => [
      "formatted",
      ...entry.args,
    ]);
    const console = createConsole({
      output,
      level: "debug",
      formatEntry,
    });

    console.info("info message");
    console.dir({ foo: 1 });

    expect(output.entries[0].formattedArgs).toEqual([
      "formatted",
      "info message",
    ]);
    expect(output.entries[1].formattedArgs).toEqual([{ foo: 1 }]);
  });

  test("children tracking", () => {
    const console = createConsole();
    const child1 = console.child("a");
    const child2 = console.child("b");
    const grandchild = child1.child("c");

    expect(console.children.size).toBe(2);
    expect(console.children.has(child1)).toBe(true);
    expect(console.children.has(child2)).toBe(true);
    expect(child1.children.size).toBe(1);
    expect(child1.children.has(grandchild)).toBe(true);
  });

  test("name property", () => {
    const console = createConsole({ name: "root" });
    const child = console.child("relay");

    expect(console.name).toBe("root");
    expect(child.name).toBe("relay");
  });
});

describe("createConsoleEntryFormatter", () => {
  test("formats path", () => {
    const formatter = createConsoleEntryFormatter(createTimeDep())();
    const entry: ConsoleEntry = {
      method: "info",
      path: ["relay", "db"],
      args: ["message"],
    };

    const result = formatter(entry);

    expect(result).toEqual(["[relay] [db]", "message"]);
  });

  test("with no path returns args unchanged", () => {
    const formatter = createConsoleEntryFormatter(createTimeDep())();
    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message", 123],
    };

    const result = formatter(entry);

    expect(result).toEqual(["message", 123]);
  });

  test("relative timestamp", () => {
    const time = testCreateTime({ startAt: 1000 as Millis });
    const formatter = createConsoleEntryFormatter({ time })({
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

    expect(result1).toMatchInlineSnapshot(`
      [
        "+0.000s",
        "first",
      ]
    `);
    expect(result2).toMatchInlineSnapshot(`
      [
        "+1.500s",
        "second",
      ]
    `);
  });

  test("relative timestamp with custom start time", () => {
    const time = testCreateTime({ startAt: 1500 as Millis });
    const formatter = createConsoleEntryFormatter({ time })({
      timestampFormat: "relative",
      startTime: 500 as Millis,
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    const result = formatter(entry);

    expect(result).toMatchInlineSnapshot(`
      [
        "+1.000s",
        "message",
      ]
    `);
  });

  test("iso timestamp", () => {
    const time = testCreateTime({
      startAt: Date.UTC(2026, 0, 28, 14, 30, 0, 123) as Millis,
    });
    const formatter = createConsoleEntryFormatter({ time })({
      timestampFormat: "iso",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    const result = formatter(entry);

    expect(result).toEqual(["2026-01-28T14:30:00.123Z", "message"]);
  });

  test("absolute timestamp", () => {
    const time = testCreateTime({
      startAt: Date.UTC(2026, 0, 28, 14, 30, 15, 123) as Millis,
    });
    const formatter = createConsoleEntryFormatter({ time })({
      timestampFormat: "absolute",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: [],
      args: ["message"],
    };

    const result = formatter(entry);

    // Result includes local time formatted as HH:MM:SS.mmm
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(result[1]).toBe("message");
  });

  test("combines timestamp and path", () => {
    const formatter = createConsoleEntryFormatter(createTimeDep())({
      timestampFormat: "relative",
    });

    const entry: ConsoleEntry = {
      method: "info",
      path: ["relay"],
      args: ["message"],
    };

    const result = formatter(entry);

    expect(result).toMatchInlineSnapshot(`
      [
        "+0.000s [relay]",
        "message",
      ]
    `);
  });
});

describe("createNativeConsoleOutput", () => {
  test("calls native console", () => {
    const logSpy = vi
      .spyOn(globalThis.console, "info")
      .mockImplementation(() => undefined);
    const output = createNativeConsoleOutput();

    output.write({
      method: "info",
      path: [],
      args: ["hello", "world"],
    });

    expect(logSpy).toHaveBeenCalledWith("hello", "world");
    logSpy.mockRestore();
  });

  test("applies formatter", () => {
    const logSpy = vi
      .spyOn(globalThis.console, "info")
      .mockImplementation(() => undefined);
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

    expect(logSpy).toHaveBeenCalledWith("prefix", "message");
    logSpy.mockRestore();
  });
});

describe("testCreateConsole", () => {
  test("captures entries", () => {
    const console = testCreateConsole();

    console.info("first");
    console.info("second");

    expect(console.getEntriesSnapshot()).toMatchInlineSnapshot(`
      [
        {
          "args": [
            "first",
          ],
          "method": "info",
          "path": [],
        },
        {
          "args": [
            "second",
          ],
          "method": "info",
          "path": [],
        },
      ]
    `);
  });

  test("defaults to trace level (logs everything)", () => {
    const console = testCreateConsole();

    console.trace("trace");
    console.debug("debug");
    console.log("log");
    console.info("info");
    console.warn("warn");
    console.error("error");

    expect(console.getEntriesSnapshot().map((e) => e.method)).toEqual([
      "trace",
      "debug",
      "log",
      "info",
      "warn",
      "error",
    ]);
  });

  test("respects configured level", () => {
    const console = testCreateConsole({ level: "warn" });

    console.debug("ignored");
    console.info("ignored");
    console.warn("logged");
    console.error("logged");

    expect(console.getEntriesSnapshot().map((e) => e.method)).toEqual([
      "warn",
      "error",
    ]);
  });

  test("getEntriesSnapshot clears entries", () => {
    const console = testCreateConsole();

    console.info("first");
    expect(console.getEntriesSnapshot()).toHaveLength(1);
    expect(console.getEntriesSnapshot()).toHaveLength(0);
  });

  test("clearEntries clears without returning", () => {
    const console = testCreateConsole();

    console.info("message");
    console.clearEntries();

    expect(console.getEntriesSnapshot()).toHaveLength(0);
  });

  test("child adds path", () => {
    const console = testCreateConsole();
    const child = console.child("relay").child("db");

    child.info("message");

    expect(console.getEntriesSnapshot()[0].path).toEqual(["relay", "db"]);
  });

  test("child inherits level at creation (static)", () => {
    const console = testCreateConsole({ level: "info" });
    const child = console.child("relay");

    // Child inherits "info" level
    child.debug("ignored");
    child.info("logged");

    // Parent change doesn't affect child
    console.setLevel("debug");
    child.debug("still ignored");

    expect(console.getEntriesSnapshot().map((e) => e.args[0])).toEqual([
      "logged",
    ]);
  });

  test("child can override level independently", () => {
    const console = testCreateConsole({ level: "info" });
    const child = console.child("relay");

    child.setLevel("debug");
    child.debug("logged");

    expect(console.getEntriesSnapshot().map((e) => e.args[0])).toEqual([
      "logged",
    ]);
  });

  test("debug-level methods use debug level", () => {
    const console = testCreateConsole({ level: "log" });

    console.time("timer");
    console.dir({ foo: 1 });
    console.table([1, 2]);
    console.count("counter");

    expect(console.getEntriesSnapshot()).toHaveLength(0);

    console.setLevel("debug");

    console.time("timer");
    console.timeLog("timer", "extra");
    console.timeEnd("timer");
    console.dir({ foo: 1 });
    console.table([1, 2]);
    console.count("counter");
    console.countReset("counter");

    expect(console.getEntriesSnapshot().map((e) => e.method)).toEqual([
      "time",
      "timeLog",
      "timeEnd",
      "dir",
      "table",
      "count",
      "countReset",
    ]);
  });

  test("children tracking", () => {
    const console = testCreateConsole();
    const child1 = console.child("a");
    const child2 = console.child("b");

    expect(console.children.size).toBe(2);
    expect(console.children.has(child1)).toBe(true);
    expect(console.children.has(child2)).toBe(true);
  });

  test("name property", () => {
    const console = testCreateConsole();
    const child = console.child("relay");

    expect(console.name).toBe("");
    expect(child.name).toBe("relay");
  });
});

describe("createConsoleArrayOutput", () => {
  test("captures entries to array", () => {
    const entries: Array<ConsoleEntry> = [];
    const output = createConsoleArrayOutput(entries);

    output.write({
      method: "info",
      path: ["relay"],
      args: ["message", 123],
    });

    expect(entries).toEqual([
      {
        method: "info",
        path: ["relay"],
        args: ["message", 123],
      },
    ]);
  });

  test("works with createConsole", () => {
    const entries: Array<ConsoleEntry> = [];
    const output = createConsoleArrayOutput(entries);
    const console = createConsole({ output });

    console.info("hello");
    console.warn("world");

    expect(entries.map((e) => e.method)).toEqual(["info", "warn"]);
    expect(entries.map((e) => e.args[0])).toEqual(["hello", "world"]);
  });
});
