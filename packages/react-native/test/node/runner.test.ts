/**
 * The device runner outside any test, with both specs mocked, since Node.js
 * can't load React Native: a failure there, such as a native build without
 * `EvoluApp`'s directory, must reach the driver as a line of its own, and
 * nothing else, since a reported defect is fatal on React Native.
 */
import { assertEqual } from "@evolu/common";
import { mock, test } from "node:test";
import { setTimeout } from "node:timers/promises";

/** What the mocked specs give, which each test sets. */
const native = {
  binding: {} as object,
  getDatabaseDirectory: (): string => "",
};

mock.module(
  new URL("../../src/specs/NativeEvoluSqlite.ts", import.meta.url).href,
  { exports: { default: { createBinding: () => native.binding } } },
);
mock.module(
  new URL("../../src/specs/NativeEvoluApp.ts", import.meta.url).href,
  {
    exports: {
      default: {
        getDatabaseDirectory: () => native.getDatabaseDirectory(),
        reloadApp: () => undefined,
      },
    },
  },
);

const { runDeviceTests } = await import("../device/runner.ts");

/**
 * Runs the runner on `binding` and `getDatabaseDirectory`, and returns the
 * lines it logged.
 */
const setupRun = async (
  binding: object,
  getDatabaseDirectory: () => string,
): Promise<ReadonlyArray<string>> => {
  native.binding = binding;
  native.getDatabaseDirectory = getDatabaseDirectory;
  const lines: Array<string> = [];
  await runDeviceTests({
    platform: "ios",
    assertEqual,
    createEvoluDeps: () => {
      throw new Error("The runner fails before any test.");
    },
    log: (line) => {
      lines.push(line);
    },
  });
  return lines;
};

test("logs a failure outside any test as the runner's", async () => {
  const lines = await setupRun({ abiVersion: 1 }, () => {
    throw new Error("No directory.");
  });

  assertEqual(lines, ["EvoluNativeTests failed: runner: No directory."]);
});

test("logs a throw inside its Run as the runner's failure, and reports no defect", async () => {
  const lines = await setupRun(
    {
      abiVersion: 1,
      isFileOpen: () => false,
      openFile: () => {
        throw new Error("No file.");
      },
    },
    () => "/data/SQLite",
  );
  // A reported defect would throw after a microtask.
  await setTimeout(10);

  assertEqual(lines, ["EvoluNativeTests failed: runner: No file."]);
});
