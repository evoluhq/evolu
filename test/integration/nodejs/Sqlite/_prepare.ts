import {
  assertEqual,
  assertInstanceOf,
  assertLength,
  assertThrows,
  assertTrue,
  createSqlite,
  sql,
  testCreateRun,
  type CreateSqliteDriver,
  type CreateSqliteDriverDep,
  type DisposableRun,
  type Name,
  type Sqlite,
  type SqliteDriver,
  type SqliteDriverOptions,
  type TestRunDefaultDeps,
} from "@evolu/common";
import { test } from "node:test";

export interface SqliteAndDriverSetup {
  readonly run: DisposableRun<TestRunDefaultDeps & CreateSqliteDriverDep>;
  readonly sqlite: Sqlite;
  readonly driver: SqliteDriver;
}

/**
 * Creates a {@link Sqlite} with `createSqliteDriver` and returns it with the
 * driver it opened and its Run.
 */
export const setupSqliteAndDriver = async (
  createSqliteDriver: CreateSqliteDriver,
  name: Name,
  options?: SqliteDriverOptions,
): Promise<SqliteAndDriverSetup> => {
  const drivers: Array<SqliteDriver> = [];
  const capturingCreateSqliteDriver: CreateSqliteDriver =
    (driverName, driverOptions) => async (run) => {
      const created = await run(createSqliteDriver(driverName, driverOptions));
      if (created.ok) drivers.push(created.value);
      return created;
    };
  const run = testCreateRun({
    createSqliteDriver: capturingCreateSqliteDriver,
  });
  const sqlite = await run.ok(createSqlite(name, options));
  assertLength(drivers, 1);
  return { run, sqlite, driver: drivers[0] };
};

/**
 * Registers the tests of {@link SqliteDriver.prepare} for drivers that `open`
 * creates, each over a new empty database.
 */
export const describeSqliteDriverPrepare = (
  open: () => Promise<SqliteDriver>,
): void => {
  test("prepare returns a statement that runs many times, also after a failed run", async () => {
    using driver = await open();
    driver.exec(sql`create table t (a unique);`);
    const insertOne = sql`insert into t (a) values (${1});`;
    const insertTwo = sql`insert into t (a) values (${2});`;
    using statement = driver.prepare(insertOne.sql);

    assertEqual(statement.exec(insertOne.parameters), { rows: [], changes: 1 });
    assertThrows(
      () => statement.exec(insertOne.parameters),
      (error) => {
        assertInstanceOf(error, Error);
        assertTrue(error.message.includes("UNIQUE constraint failed"));
      },
    );
    assertEqual(statement.exec(insertTwo.parameters), { rows: [], changes: 1 });

    assertEqual(driver.exec(sql`select a from t order by a;`).rows, [
      { a: 1 },
      { a: 2 },
    ]);
  });

  test("a disposed statement throws on exec, and disposing it again does nothing", async () => {
    using driver = await open();
    const select = sql`select 1 as a;`;
    const statement = driver.prepare(select.sql);

    statement[Symbol.dispose]();

    assertThrows(
      () => statement.exec(select.parameters),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "Cannot use a disposed object.");
      },
    );
    statement[Symbol.dispose]();
  });
};
