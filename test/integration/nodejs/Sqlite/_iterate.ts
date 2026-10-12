import {
  assertEqual,
  assertInstanceOf,
  assertSame,
  assertThrows,
  assertTrue,
  sql,
  type SqliteDriver,
  type SqliteRow,
} from "@evolu/common";
import { test } from "node:test";

/**
 * Registers the tests of {@link SqliteDriver.iterate} for drivers that `open`
 * creates, each over a new empty database.
 */
export const describeSqliteDriverIterate = (
  open: () => Promise<SqliteDriver>,
): void => {
  const setupDriver = async (): Promise<SqliteDriver> => {
    const driver = await open();
    driver.exec(sql`create table t (a);`);
    driver.exec(sql`
      insert into t
      values
        (1),
        (2),
        (3),
        (4);
    `);
    return driver;
  };

  // abs() of the smallest integer overflows, which only the third row computes,
  // so stepping it fails. The operand depends on the row, so SQLite does not
  // compute it once before the first row, as it does a constant, and there is
  // no ORDER BY, whose sort would compute it for every row before the first.
  const failsAtThirdRow = sql`
    select a
    from t
    where abs(-9223372036854775807 - (a = 3)) > 0;
  `;

  const assertOverflow = (error: unknown): void => {
    assertInstanceOf(error, Error);
    assertTrue(error.message.includes("integer overflow"));
  };

  test("iterate passes rows one at a time and steps no row past the one onRow stops at", async () => {
    using driver = await setupDriver();
    const rows: Array<SqliteRow> = [];

    driver.iterate(failsAtThirdRow, (row) => {
      rows.push(row);
      return rows.length < 2;
    });

    assertEqual(rows, [{ a: 1 }, { a: 2 }]);
    // Stepping the third row fails, so the iteration above did not step it.
    assertThrows(() => {
      driver.iterate(failsAtThirdRow, () => true);
    }, assertOverflow);
  });

  test("iterate passes every row when onRow does not stop it, with the query's parameters bound", async () => {
    using driver = await setupDriver();
    const rows: Array<SqliteRow> = [];

    driver.iterate(sql`select a from t where a > ${2} order by a;`, (row) => {
      rows.push(row);
      return true;
    });

    assertEqual(rows, [{ a: 3 }, { a: 4 }]);
  });

  test("onRow can read with other queries, the iterated one among them, while the iteration continues", async () => {
    using driver = await setupDriver();
    // Prepared, so exec caches its statement, which an iteration that stepped
    // that statement would find busy.
    const query = {
      ...sql`select a from t order by a;`,
      options: { prepare: true },
    };
    const rows: Array<SqliteRow> = [];
    const reads: Array<SqliteRow> = [];

    driver.iterate(query, (row) => {
      rows.push(row);
      reads.push(...driver.exec(query).rows);
      return true;
    });

    const all = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }];
    assertEqual(rows, all);
    assertEqual(reads, [...all, ...all, ...all, ...all]);
  });

  test("iterate rethrows what onRow throws, after which the query runs again", async () => {
    using driver = await setupDriver();
    const thrown = new Error("onRow failed");
    const query = sql`select a from t order by a;`;

    assertThrows(
      () => {
        driver.iterate(query, () => {
          throw thrown;
        });
      },
      (error) => {
        assertSame(error, thrown);
      },
    );

    const rows: Array<SqliteRow> = [];
    driver.iterate(query, (row) => {
      rows.push(row);
      return true;
    });
    assertEqual(rows, [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);
    assertEqual(driver.exec(query).rows.length, 4);
  });

  test("iterate throws the error of a failed step", async () => {
    using driver = await setupDriver();
    const rows: Array<SqliteRow> = [];

    assertThrows(() => {
      driver.iterate(failsAtThirdRow, (row) => {
        rows.push(row);
        return true;
      });
    }, assertOverflow);

    assertEqual(rows, [{ a: 1 }, { a: 2 }]);
  });
};
