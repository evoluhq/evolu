import { assertEqual, assertTrue } from "@evolu/common";
import { it } from "node:test";
import { runCoreTests } from "../scripts/test.mts";

it(
  "passes the C test suite",
  // The first run compiles SQLite and can generate its amalgamation.
  { timeout: 600_000 },
  async () => {
    const { EVOLU_TEST_SOFTWARE_CRYPTO: _, ...env } = process.env;
    const result = await runCoreTests({ env });

    if (result.status !== 0) process.stdout.write(result.output);
    assertEqual(result.status, 0);
    assertTrue(result.output.includes("# crypto: hardware\n"));
  },
);

it(
  "passes the C test suite on the software crypto path",
  { timeout: 600_000 },
  async () => {
    const result = await runCoreTests({
      env: { ...process.env, EVOLU_TEST_SOFTWARE_CRYPTO: "1" },
    });

    if (result.status !== 0) process.stdout.write(result.output);
    assertEqual(result.status, 0);
    assertTrue(result.output.includes("# crypto: software\n"));
  },
);
