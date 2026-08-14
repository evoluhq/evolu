import { err, ok, PositiveInt, testCreateRun, type Task } from "@evolu/common";
import { describe, expect, test, vi } from "vitest";
import { spawn, type SpawnError } from "../packages/nodejs/src/Cli.ts";
import { verify, type VerifyCommand } from "./verify.mts";

vi.mock("../packages/nodejs/src/Cli.ts", () => ({ spawn: vi.fn() }));

const nonTestCommands: ReadonlyArray<VerifyCommand> = [
  "typecheck",
  "build",
  "biome",
  "lint-monorepo",
  "check:packages",
  "build:docs",
  "lint",
];

type TestVerifyCommand = (command: VerifyCommand) => Task<void, SpawnError>;

const mockVerifyCommand = (verifyCommand: TestVerifyCommand): void => {
  vi.mocked(spawn).mockImplementation((file, args) => {
    expect(file).toBe("pnpm");
    return verifyCommand(argsToVerifyCommand(args));
  });
};

const argsToVerifyCommand = (args: ReadonlyArray<string>): VerifyCommand => {
  switch (args[0]) {
    case "biome":
    case "build":
    case "build:docs":
    case "check:packages":
    case "lint":
    case "lint-monorepo":
    case "test:coverage":
    case "test:jsdoc":
    case "typecheck":
      return args[0];
    default:
      throw new Error(`Unexpected verify command: ${args[0]}`);
  }
};

describe("verify", () => {
  test("runs hardware-limited waves before serial JSDoc and coverage", async () => {
    const startedCommands: Array<VerifyCommand> = [];
    const completedCommands = new Set<VerifyCommand>();
    let activeCommands = 0;
    let maximumActiveCommands = 0;

    const verifyCommand: TestVerifyCommand = (command) => async () => {
      if (command === "build") {
        expect(completedCommands.has("typecheck")).toBe(true);
      }
      if (
        command === "check:packages" ||
        command === "build:docs" ||
        command === "lint"
      ) {
        expect(completedCommands.has("build")).toBe(true);
        expect(completedCommands.has("biome")).toBe(true);
        expect(completedCommands.has("lint-monorepo")).toBe(true);
      }
      if (command === "test:jsdoc") {
        expect(activeCommands).toBe(0);
        expect(completedCommands).toEqual(new Set(nonTestCommands));
      }
      if (command === "test:coverage") {
        expect(activeCommands).toBe(0);
        expect(completedCommands).toEqual(
          new Set([...nonTestCommands, "test:jsdoc"]),
        );
      }

      startedCommands.push(command);
      activeCommands++;
      maximumActiveCommands = Math.max(maximumActiveCommands, activeCommands);
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeCommands--;
      completedCommands.add(command);
      return ok();
    };
    mockVerifyCommand(verifyCommand);

    await using run = testCreateRun({
      availableParallelism: () => PositiveInt.orThrow(2),
    });
    const result = await run(verify);

    expect(result).toEqual(ok());
    expect(maximumActiveCommands).toBe(2);
    expect(startedCommands.slice(-2)).toEqual(["test:jsdoc", "test:coverage"]);
  });

  test("stops before coverage after a failed JSDoc check", async () => {
    const startedCommands: Array<VerifyCommand> = [];
    const failure: SpawnError = {
      type: "SpawnError",
      command: "pnpm test:jsdoc",
      exitCode: 1,
      signal: null,
      message: "pnpm test:jsdoc exited with code 1.",
    };
    const verifyCommand: TestVerifyCommand = (command) => () => {
      startedCommands.push(command);
      return command === "test:jsdoc" ? err(failure) : ok();
    };
    mockVerifyCommand(verifyCommand);

    await using run = testCreateRun({
      availableParallelism: () => PositiveInt.orThrow(2),
    });
    const result = await run(verify);

    expect(result).toEqual(err(failure));
    expect(startedCommands.at(-1)).toBe("test:jsdoc");
    expect(startedCommands).not.toContain("test:coverage");
  });

  test("stops before later commands after a failed check", async () => {
    const startedCommands: Array<VerifyCommand> = [];
    const failure: SpawnError = {
      type: "SpawnError",
      command: "pnpm biome",
      exitCode: 1,
      signal: null,
      message: "pnpm biome exited with code 1.",
    };
    const verifyCommand: TestVerifyCommand = (command) => () => {
      startedCommands.push(command);
      return command === "biome" ? err(failure) : ok();
    };
    mockVerifyCommand(verifyCommand);

    await using run = testCreateRun({
      availableParallelism: () => PositiveInt.orThrow(1),
    });
    const result = await run(verify);

    expect(result).toEqual(err(failure));
    expect(startedCommands).toEqual(["typecheck", "build", "biome"]);
  });

  test("aborts a running sibling after a failed concurrent check", async () => {
    const startedCommands: Array<VerifyCommand> = [];
    const failure: SpawnError = {
      type: "SpawnError",
      command: "pnpm biome",
      exitCode: 1,
      signal: null,
      message: "pnpm biome exited with code 1.",
    };
    let typecheckAborted = false;
    const verifyCommand: TestVerifyCommand = (command) => async (run) => {
      startedCommands.push(command);
      if (command === "biome") return err(failure);
      if (command !== "typecheck") return ok();

      return new Promise((_, reject) => {
        run.signal.addEventListener(
          "abort",
          () => {
            typecheckAborted = true;
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Evolu abort control flow uses an exact plain object, not Error.
            reject(run.signal.reason);
          },
          { once: true },
        );
      });
    };
    mockVerifyCommand(verifyCommand);

    await using run = testCreateRun({
      availableParallelism: () => PositiveInt.orThrow(2),
    });
    const result = await run(verify);

    expect(result).toEqual(err(failure));
    expect(typecheckAborted).toBe(true);
    expect(startedCommands).toEqual(["typecheck", "biome"]);
  });
});
