import {
  AbortError,
  assertEqual,
  assertErr,
  assertFalse,
  assertNotUndefined,
  assertOk,
  assertSame,
  assertTrue,
  ByteSizeLiteral,
  ok,
  PortFromString,
  PositiveInt,
  testCreateRun,
  type ReadonlyRecord,
  type Task,
} from "@evolu/common";
import { testAppOwner } from "@evolu/common/local-first";
import { runMain, type NodeJsRelayConfig } from "@evolu/nodejs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const setupRelayProcess = (env: ReadonlyRecord<string, string>) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-relay-config-"));
  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        name !== "PORT" && !name.toUpperCase().startsWith("EVOLU_RELAY_"),
    ),
  );

  try {
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, "../../../../../apps/relay/src/index.ts")],
      {
        cwd: directory,
        env: { ...inheritedEnv, ...env },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assertSame(result.error, undefined);
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      createdData: existsSync(join(directory, "data")),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("relay configuration", () => {
  it("validates startup configuration and applies quotas", async (t) => {
    const previousEnv = process.env;
    const previousExitCode = process.exitCode;
    t.after(() => {
      process.env = previousEnv;
      process.exitCode = previousExitCode;
    });
    t.mock.method(process, "chdir", () => {});
    t.mock.module("node:fs", {
      // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
      exports: { mkdirSync: () => {} },
    });
    let main: Task<void> | undefined;
    let config: NodeJsRelayConfig | undefined;
    t.mock.module("@evolu/nodejs", {
      // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
      exports: {
        createRelayDeps: () => ({}),
        runMain: () => (task: Task<void>) => {
          main = task;
        },
        createRelay: (value: NodeJsRelayConfig) => {
          config = value;
          return () => ok();
        },
      },
    });

    await import("../../../../../apps/relay/src/index.ts");
    assertNotUndefined(main);
    for (const [port, expectedPort] of [
      [undefined, 4000],
      ["4001", 4001],
      ["0", 0],
    ] as const) {
      process.env = port === undefined ? {} : { PORT: port };
      await using run = testCreateRun();
      assertOk(await run(main));
      assertNotUndefined(config);
      assertSame(config.port, expectedPort);
    }

    for (const [quota, atLimit, aboveLimit] of [
      [undefined, true, true],
      ["10MiB", true, false],
      ["0B", false, false],
    ] as const) {
      process.env =
        quota === undefined ? {} : { EVOLU_RELAY_MAX_OWNER_BYTES: quota };
      await using run = testCreateRun();
      await run(main);
      assertNotUndefined(config);
      assertEqual(
        await config.isOwnerWithinQuota(
          testAppOwner.id,
          PositiveInt.orThrow(10 * 1024 * 1024),
        ),
        atLimit,
      );
      assertEqual(
        await config.isOwnerWithinQuota(
          testAppOwner.id,
          PositiveInt.orThrow(10 * 1024 * 1024 + 1),
        ),
        aboveLimit,
      );
    }

    process.env = { PORT: "65536", EVOLU_RELAY_MAX_OWNER_BYTES: "invalid" };
    let reported: unknown;
    await runMain({
      reportDefect: (defect: unknown) => {
        reported = defect;
      },
    })(main);
    assertTrue(AbortError.is(reported));
    assertTrue("defect" in reported.reason);
    const error = reported.reason.defect;
    assertTrue(error instanceof Error);
    assertEqual(
      error.message,
      "The value 65536 must be less than or equal to 65535.",
    );
    const port = PortFromString.fromUnknown("65536", { errors: "all" });
    const quota = ByteSizeLiteral.fromUnknown("invalid", { errors: "all" });
    assertErr(port);
    assertErr(quota);
    assertEqual(error.cause, {
      type: "Env",
      outputError: {
        type: "ObjectKeys",
        error: {
          type: "Object",
          reason: {
            kind: "Properties",
            errors: {
              PORT: port.error,
              EVOLU_RELAY_MAX_OWNER_BYTES: quota.error,
            },
          },
        },
      },
    });
    assertSame(process.exitCode, 1);
  });

  it("rejects malformed environment names before creating a database", () => {
    const result = setupRelayProcess({
      PORT: "4000",
      EVOLU_RELAY_PORT_: "5000",
    });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes(
        'The property "EVOLU_RELAY_PORT_" is not allowed.',
      ),
    );
    assertFalse(result.createdData);
  });

  it("reports the first configuration error before creating a database", () => {
    const result = setupRelayProcess({
      PORT: "65536",
      EVOLU_RELAY_MAX_OWNER_BYTES: "invalid",
      EVOLU_RELAY_UNKNOWN: "1",
    });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes(
        "The value 65536 must be less than or equal to 65535.",
      ),
    );
    assertFalse(
      result.output.includes(
        'The value "invalid" is not a byte-size literal. Use a value such as "512KiB" or "1MiB".',
      ),
    );
    assertFalse(
      result.output.includes(
        'The property "EVOLU_RELAY_UNKNOWN" is not allowed.',
      ),
    );
    assertFalse(result.createdData);
  });

  it("rejects incorrectly cased relay settings before creating a database", () => {
    const result = setupRelayProcess({ evolu_relay_max_owner_bytes: "1MiB" });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes(
        'The property "evolu_relay_max_owner_bytes" is not allowed.',
      ),
    );
    assertFalse(result.createdData);
  });

  it("rejects an invalid PORT before creating a database", () => {
    const result = setupRelayProcess({
      PORT: "invalid",
    });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes('The value "invalid" is not a decimal integer.'),
    );
    assertFalse(result.createdData);
  });

  it("rejects the removed EVOLU_RELAY_PORT override", () => {
    const result = setupRelayProcess({
      PORT: "4000",
      EVOLU_RELAY_PORT: "5000",
    });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes('The property "EVOLU_RELAY_PORT" is not allowed.'),
    );
    assertFalse(result.createdData);
  });

  it("does not replace an empty PORT with the default", () => {
    const result = setupRelayProcess({ PORT: "" });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes('The value "" is not a decimal integer.'),
    );
    assertFalse(result.createdData);
  });

  it("defaults an absent PORT and still rejects an invalid quota", () => {
    const result = setupRelayProcess({
      EVOLU_RELAY_MAX_OWNER_BYTES: "invalid",
    });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes(
        'The value "invalid" is not a byte-size literal. Use a value such as "512KiB" or "1MiB".',
      ),
    );
    assertFalse(result.createdData);
  });

  it("rejects bare byte counts before creating a database", () => {
    const result = setupRelayProcess({
      EVOLU_RELAY_MAX_OWNER_BYTES: "1048576",
    });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes(
        'The value "1048576" is not a byte-size literal. Use a value such as "512KiB" or "1MiB".',
      ),
    );
    assertFalse(result.createdData);
  });

  it("rejects an empty quota before creating a database", () => {
    const result = setupRelayProcess({ EVOLU_RELAY_MAX_OWNER_BYTES: "" });
    assertEqual(result.status, 1);
    assertTrue(
      result.output.includes('The value "" is not a byte-size literal.'),
    );
    assertFalse(result.createdData);
  });

  it("accepts size literals and still rejects unknown settings", () => {
    for (const quota of ["0B", "512KiB", "1MiB", "1.5GiB"]) {
      const result = setupRelayProcess({
        EVOLU_RELAY_MAX_OWNER_BYTES: quota,
        EVOLU_RELAY_UNKNOWN: "1",
      });
      assertEqual(result.status, 1);
      assertTrue(
        result.output.includes(
          'The property "EVOLU_RELAY_UNKNOWN" is not allowed.',
        ),
      );
      assertFalse(result.output.includes("is not a byte-size literal"));
      assertFalse(result.createdData);
    }
  });
});
