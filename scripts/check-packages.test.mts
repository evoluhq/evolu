import { assertFalse, assertSame, assertTrue } from "@evolu/common";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("check-packages.mts", import.meta.url));

describe("check-packages.mts", () => {
  for (const [field, version] of [
    ["dependencies", "^0.29.6"],
    ["dependencies", "latest"],
    ["dependencies", "workspace:^"],
    ["dependencies", "0.29.6-0 || ^0.29.6"],
    ["dependencies", "npm:kysely@^0.29.6"],
    ["optionalDependencies", "~4.0.9"],
  ] as const) {
    it(`rejects ${version} in ${field} of a published package`, (t) => {
      const result = setupCheck(t, { [field]: { kysely: version } });

      assertSame(result.status, 1);
      assertTrue(
        result.stderr.includes(
          `@evolu/common must pin kysely to an exact version, not ${version}`,
        ),
      );
    });
  }

  it("rejects a range after a workspace dependency", (t) => {
    const result = setupCheck(t, {
      dependencies: { "@evolu/web": "workspace:*" },
      optionalDependencies: { "@noble/hashes": "~2.4.0" },
    });

    assertSame(result.status, 1);
    assertTrue(
      result.stderr.includes(
        "@evolu/common must pin @noble/hashes to an exact version, not ~2.4.0",
      ),
    );
  });

  it("accepts exact versions, prereleases, and workspace dependencies", (t) => {
    const result = setupCheck(t, {
      dependencies: {
        kysely: "0.29.6",
        react: "19.0.0-rc-66855b96-20241106",
        "@evolu/web": "workspace:*",
      },
    });

    // The check moves on to the next package, which the fixture lacks.
    assertSame(result.status, 1);
    assertFalse(result.stderr.includes("must pin"));
    assertTrue(result.stderr.includes("packages/nodejs/package.json"));
  });

  it("rejects a range in the relay's dependencies", (t) => {
    const result = setupCheck(t, {}, (directory) => {
      for (const name of readdirSync(
        new URL("../packages/", import.meta.url),
      )) {
        mkdirSync(join(directory, "packages", name), { recursive: true });
        writeFileSync(
          join(directory, "packages", name, "package.json"),
          JSON.stringify({ name: `@evolu/${name}` }),
        );
      }
      mkdirSync(join(directory, "apps/relay"), { recursive: true });
      writeFileSync(
        join(directory, "apps/relay/package.json"),
        JSON.stringify({
          name: "@evolu/relay",
          dependencies: { ws: "^8.22.0" },
        }),
      );
    });

    assertSame(result.status, 1);
    assertTrue(
      result.stderr.includes(
        "@evolu/relay must pin ws to an exact version, not ^8.22.0",
      ),
    );
  });
});

/**
 * Runs a copy of the script in a repository with @evolu/common and what
 * `setupRepository` adds.
 */
const setupCheck = (
  t: TestContext,
  packageJson: Readonly<Record<string, unknown>>,
  setupRepository?: (directory: string) => void,
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-check-packages-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  mkdirSync(join(directory, "scripts"));
  copyFileSync(script, join(directory, "scripts/check-packages.mts"));
  mkdirSync(join(directory, "packages/common"), { recursive: true });
  writeFileSync(
    join(directory, "packages/common/package.json"),
    JSON.stringify({ name: "@evolu/common", ...packageJson }),
  );
  setupRepository?.(directory);
  return spawnSync(
    process.execPath,
    [join(directory, "scripts/check-packages.mts")],
    { cwd: directory, encoding: "utf8" },
  );
};
