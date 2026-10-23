/**
 * The fixtures the device driver seeds into expo-sqlite's directory, written
 * with the host SQLCipher of each expo-sqlite release, as
 * `@evolu/sqlite-core`'s test/sqlcipher.mts builds it, then opened with the
 * driver on the N-API mirror, as the apps' device suites open them.
 */
import {
  assertEqual,
  EncryptionKey,
  Name,
  sql,
  testCreateRun,
} from "@evolu/common";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runDeviceTestsCli } from "../../scripts/device-tests.mts";
import type { NativeSqlite } from "../../src/sqlite/Binding.ts";
import { createNativeSqliteDriver } from "../../src/sqlite/Driver.ts";
import {
  deviceFixtureKey,
  deviceFixtureRows,
  deviceFixtures,
} from "../device/suites.ts";

const binding = (await setupAddon()).createBinding() as NativeSqlite;

test(
  "writes each release's database and its crash with a hot journal, which the driver opens with every row, rolling the journal back",
  { timeout: 600_000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "evolu-device-fixtures-"));
    t.after(() => {
      rmSync(directory, { recursive: true, force: true });
    });
    const log = t.mock.method(console, "log", () => undefined);

    assertEqual(
      await runDeviceTestsCli([`--write-fixtures=${directory}`], {}),
      0,
    );
    log.mock.restore();

    assertEqual(
      readdirSync(directory).toSorted(),
      deviceFixtures
        .flatMap(({ name, crashed }) => [
          `evolu1-${name}.db`,
          ...(crashed ? [`evolu1-${name}.db-journal`] : []),
        ])
        .toSorted(),
    );
    for (const { name, crashed } of deviceFixtures) {
      const journal = join(directory, `evolu1-${name}.db-journal`);
      if (crashed) assertEqual(readFileSync(journal)[0] > 0, true);

      await using run = testCreateRun();
      using driver = await run.ok(
        createNativeSqliteDriver({
          nativeSqlite: binding,
          databaseDirectory: directory,
        })(Name.orThrow(name), {
          mode: "encrypted",
          encryptionKey: EncryptionKey.orThrow(deviceFixtureKey),
        }),
      );

      assertEqual(
        driver.exec(sql`
          select
            (
              select count(*) from t where v like 'evolu-secret-row%'
            ) as original,
            (select count(*) from t where v like 'updated%') as updated,
            (
              select integrity_check from pragma_integrity_check limit 1
            ) as integrity;
        `).rows,
        [{ original: deviceFixtureRows, updated: 0, integrity: "ok" }],
      );
      // The rollback left no hot journal: a journal stays only empty or with
      // zeros in place of its header, as after any open.
      assertEqual(
        existsSync(journal) && (readFileSync(journal)[0] ?? 0) !== 0,
        false,
      );
    }
  },
);
