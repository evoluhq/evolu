import {
  assertEqual,
  assertErr,
  assertOk,
  assertTrue,
  testAbortError,
  testAbortReason,
  testCreateRun,
} from "@evolu/common";
import { test } from "node:test";
import { spawn } from "./Cli.ts";

test("spawn succeeds with inherited stdio and a configured cwd", async () => {
  await using run = testCreateRun();
  const scriptsDirectory = new URL("../../../scripts/", import.meta.url);
  const result = await run(
    spawn(
      process.execPath,
      ["-e", 'process.exit(process.cwd().endsWith("scripts") ? 0 : 1)'],
      { cwd: scriptsDirectory },
    ),
  );

  assertOk(result);
});

test("spawn returns a start error", async () => {
  await using run = testCreateRun();
  const result = await run(spawn("evolu-command-that-does-not-exist", []));

  assertErr(result);
  const { message } = result.error;
  assertTrue(
    message.startsWith("Failed to start evolu-command-that-does-not-exist:"),
  );
  assertEqual(result, {
    ok: false,
    error: {
      type: "SpawnError",
      command: "evolu-command-that-does-not-exist",
      exitCode: null,
      signal: null,
      message,
    },
  });
});

test("spawn returns a non-zero exit error", async () => {
  await using run = testCreateRun();
  const result = await run(spawn(process.execPath, ["-e", "process.exit(7)"]));
  const command = `${process.execPath} -e process.exit(7)`;

  assertErr(result, {
    type: "SpawnError",
    command,
    exitCode: 7,
    signal: null,
    message: `${command} exited with code 7.`,
  });
});

test("spawn returns a signal exit error", async () => {
  await using run = testCreateRun();
  const result = await run(
    spawn(process.execPath, ["-e", 'process.kill(process.pid, "SIGTERM")']),
  );
  const command = `${process.execPath} -e process.kill(process.pid, "SIGTERM")`;

  assertErr(result, {
    type: "SpawnError",
    command,
    exitCode: null,
    signal: "SIGTERM",
    message: `${command} exited from SIGTERM.`,
  });
});

test("spawn aborts its child process with the Run", async () => {
  await using run = testCreateRun();
  const fiber = run.abortable(
    spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
  );

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  fiber.abort(testAbortReason);

  assertErr(await fiber, testAbortError);
});
