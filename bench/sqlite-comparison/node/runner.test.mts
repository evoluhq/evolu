import { assertEqual } from "@evolu/common";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, it } from "node:test";
import { nextMessage } from "./runner.mts";

describe("nextMessage", () => {
  it("kills a child that times out", async () => {
    // A child that never answers.
    const child = spawn(
      process.execPath,
      ["--eval", "setInterval(() => {}, 1000);"],
      { stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    const exited = once(child, "exit");

    assertEqual(await nextMessage(child, 100), {
      type: "Failed",
      error: "The child timed out.",
    });
    assertEqual(await exited, [null, "SIGKILL"]);
  });
});
