/**
 * How the device driver writes its fixtures, against a fake of
 * `@evolu/sqlite-core`'s host SQLCipher whose crashes write files as a test
 * gives them, so it needs no toolchain, and test:unit runs it too.
 * `test/node/device-fixtures.test.mts` runs the real one.
 */
import { assertEqual, assertRejects, assertTrue } from "@evolu/common";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test, type TestContext } from "node:test";

/** The versions the fake builds, and what each crash at a write leaves. */
const fake = {
  releases: [] as Array<{ readonly version: string }>,
  /** Per write, from the first: a journal's first byte, or null for none. */
  crashes: [] as Array<number | null>,
  createStatus: 0,
  calls: [] as Array<string>,
};

mock.module("@evolu/sqlite-core/test/sqlcipher.mts", {
  exports: {
    // The array itself, since a mock's exports are read once.
    expoSqliteReleases: fake.releases,
    buildSqlcipherFixture: ({
      expoSqlite,
    }: {
      readonly expoSqlite: { readonly version: string };
    }) => Promise.resolve(`fixture-${expoSqlite.version}`),
    runSqlcipherFixture: (fixture: string, args: ReadonlyArray<string>) => {
      fake.calls.push(`${fixture} ${args[0]} ${args[3]}`);
      if (args[0] === "create") {
        // As SQLCipher fails to create the table in a database that has it.
        if (existsSync(args[1]))
          return { status: 1, stdout: "", stderr: "table already exists" };
        writeFileSync(args[1], `${fixture} created`);
        return {
          status: fake.createStatus,
          stdout: "",
          stderr: fake.createStatus === 0 ? "" : "no OpenSSL",
        };
      }
      const write = Number(args[3]);
      if (write > fake.crashes.length)
        return { status: 0, stdout: "", stderr: "" };
      writeFileSync(args[4], `${fixture} crashed at ${write}`);
      const journal = fake.crashes[write - 1];
      if (journal != null)
        writeFileSync(`${args[4]}-journal`, Uint8Array.of(journal, write));
      return { status: 3, stdout: "", stderr: "" };
    },
  },
});

const { runDeviceTestsCli, writeDeviceFixtures } =
  await import("./device-tests.mts");

const setup = (t: TestContext) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-device-fixtures-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  fake.releases.splice(
    0,
    Infinity,
    { version: "57.0.4" },
    { version: "58.0.13" },
  );
  fake.crashes = [];
  fake.createStatus = 0;
  fake.calls = [];
  const fixtures = join(directory, "fixtures");
  return {
    directory,
    fixtures,
    write: () =>
      writeDeviceFixtures({
        directory: fixtures,
        cacheDirectory: join(directory, "cache"),
        buildDirectory: join(directory, "build"),
      }),
  };
};

test("writes each release's created database and the crash whose hot journal is the last before the commit", async (t) => {
  const { fixtures, write } = setup(t);
  // A journal that isn't hot yet, two hot ones, then one zeroed, as SQLite
  // leaves it when it commits.
  fake.crashes = [null, 0xd9, 0xd9, 0];

  await write();

  assertEqual(readdirSync(fixtures).toSorted(), [
    "evolu1-expo-sqlite-57-0-4-crashed.db",
    "evolu1-expo-sqlite-57-0-4-crashed.db-journal",
    "evolu1-expo-sqlite-57-0-4.db",
    "evolu1-expo-sqlite-58-0-13-crashed.db",
    "evolu1-expo-sqlite-58-0-13-crashed.db-journal",
    "evolu1-expo-sqlite-58-0-13.db",
    "evolu1-ill-formed-names.db",
  ]);
  // Its schema names a column a, 0xff, b.
  assertTrue(
    readFileSync(join(fixtures, "evolu1-ill-formed-names.db")).includes(
      Buffer.from([0x61, 0xff, 0x62]),
    ),
  );
  assertEqual(
    readFileSync(join(fixtures, "evolu1-expo-sqlite-58-0-13.db"), "utf8"),
    "fixture-58.0.13 created",
  );
  assertEqual(
    readFileSync(
      join(fixtures, "evolu1-expo-sqlite-57-0-4-crashed.db"),
      "utf8",
    ),
    "fixture-57.0.4 crashed at 3",
  );
  assertEqual(
    [
      ...readFileSync(
        join(fixtures, "evolu1-expo-sqlite-57-0-4-crashed.db-journal"),
      ),
    ],
    [0xd9, 3],
  );
  assertEqual(
    fake.calls.filter((call) => call.startsWith("fixture-57.0.4")),
    [
      "fixture-57.0.4 create 30",
      "fixture-57.0.4 create 30",
      "fixture-57.0.4 crash 1",
      "fixture-57.0.4 crash 2",
      "fixture-57.0.4 crash 3",
      "fixture-57.0.4 crash 4",
      "fixture-57.0.4 crash 5",
    ],
  );
});

test("fails when no crash left a hot journal", async (t) => {
  const { write } = setup(t);
  fake.crashes = [null, 0];

  await assertRejects(write(), (error) => {
    assertEqual(
      (error as Error).message,
      "No crash of expo-sqlite 57.0.4's SQLCipher left a hot journal.",
    );
  });
});

test("fails when no crash left a hot journal, even where an earlier write left one", async (t) => {
  const { fixtures, write } = setup(t);
  mkdirSync(fixtures);
  writeFileSync(
    join(fixtures, "evolu1-expo-sqlite-57-0-4-crashed.db-journal"),
    Uint8Array.of(0xd9),
  );
  fake.crashes = [null, 0];

  await assertRejects(write(), (error) => {
    assertEqual(
      (error as Error).message,
      "No crash of expo-sqlite 57.0.4's SQLCipher left a hot journal.",
    );
  });
});

test("writes over the fixtures an earlier write left", async (t) => {
  const { fixtures, write } = setup(t);
  fake.crashes = [0xd9];
  await write();

  await write();

  assertEqual(readdirSync(fixtures).length, 7);
});

test("fails when @evolu/sqlite-core builds no SQLCipher of a fixture's release", async (t) => {
  const { write } = setup(t);
  fake.releases.splice(1);
  fake.crashes = [0xd9];

  await assertRejects(write(), (error) => {
    assertEqual(
      (error as Error).message,
      "@evolu/sqlite-core builds no SQLCipher of expo-sqlite 58.0.13.",
    );
  });
});

test("fails with what the fixture printed when it fails", async (t) => {
  const { write } = setup(t);
  fake.createStatus = 1;

  await assertRejects(write(), (error) => {
    assertEqual(
      (error as Error).message,
      "The SQLCipher fixture exited with 1: no OpenSSL",
    );
  });
});

test("writes the fixtures when --write-fixtures takes its directory as the next argument", async (t) => {
  const { directory, fixtures } = setup(t);
  fake.crashes = [0xd9];
  const log = t.mock.method(console, "log", () => undefined);

  const code = await runDeviceTestsCli(["--write-fixtures", fixtures], {
    env: {
      SQLITE_CORE_CACHE: join(directory, "cache"),
      SQLITE_CORE_BUILD: join(directory, "build"),
    },
  });
  log.mock.restore();

  assertEqual(code, 0);
  assertEqual(readdirSync(fixtures).length, 7);
});
