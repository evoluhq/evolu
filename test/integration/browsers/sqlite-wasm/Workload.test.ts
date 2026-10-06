/**
 * A smoke test of a few hundred mixed statements on a File database on a pool,
 * in module workers of Chromium, Firefox and WebKit.
 *
 * In Safari 16 on Apple Silicon, after about a hundred inserts and selects,
 * WebKit's optimizing wasm compiler (the OMG tier) pegged helper threads and
 * sometimes crashed compiling SQLite
 * (https://github.com/rhashimoto/wa-sqlite/discussions/94). WebKit is the
 * target, and the other engines are cheap to add. Every result is checked
 * against a model of the table in JavaScript, so a miscompilation shows too.
 */

import {
  assertEqual,
  assertTrue,
  FiniteNumber,
  type SqliteRow,
  type SqliteValue,
} from "@evolu/common";
import { test } from "vitest";
import {
  okOrThrow,
  setupPoolDirectory,
  setupSqliteWorker,
} from "./_harness.ts";

interface Item {
  readonly title: string;
  readonly done: number;
  readonly priority: number;
  readonly tags: ReadonlyArray<string>;
}

interface Statement {
  readonly sql: string;
  readonly parameters: ReadonlyArray<SqliteValue>;
  /** The rows the model expects, or null for a statement without rows. */
  readonly expected: ReadonlyArray<SqliteRow> | null;
}

const words = ["alpha", "beta", "gamma", "delta", "epsilon"] as const;

/**
 * Creates the workload and the rows each query should return: inserts in
 * transactions, updates, deletes, and queries using an index, LIKE, JSON and a
 * window function, about 300 statements in all.
 */
const createWorkload = (): ReadonlyArray<Statement> => {
  const items = new Map<number, Item>();
  const statements: Array<Statement> = [];
  const add = (
    sql: string,
    parameters: ReadonlyArray<string | number> = [],
    expected: ReadonlyArray<SqliteRow> | null = null,
  ) => {
    statements.push({
      sql,
      parameters: parameters.map((value) =>
        typeof value === "number" ? FiniteNumber.orThrow(value) : value,
      ),
      expected,
    });
  };
  const live = () => [...items].toSorted(([a], [b]) => a - b);

  add(
    "CREATE TABLE item(id INTEGER PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL, priority REAL NOT NULL, tags TEXT NOT NULL)",
  );
  add("CREATE INDEX item_done ON item(done, priority)");

  for (let id = 1; id <= 200; id++) {
    if (id % 25 === 1) add("BEGIN");
    const item: Item = {
      title: `item ${id} ${words[id % words.length]}`,
      done: id % 3 === 0 ? 1 : 0,
      // Quarters, which sums of doubles keep exact.
      priority: ((id * 7) % 11) / 4,
      tags: [words[id % 2], words[2 + (id % 3)]],
    };
    items.set(id, item);
    add("INSERT INTO item VALUES (?, ?, ?, ?, ?)", [
      id,
      item.title,
      item.done,
      item.priority,
      JSON.stringify(item.tags),
    ]);
    if (id % 25 === 0) add("COMMIT");

    if (id % 10 === 0) {
      const toggled = items.get(id / 2);
      if (toggled != null) {
        items.set(id / 2, { ...toggled, done: 1 - toggled.done });
        add("UPDATE item SET done = 1 - done WHERE id = ?", [id / 2]);
      }
    }
    if (id % 15 === 0) {
      items.delete(id - 7);
      add("DELETE FROM item WHERE id = ?", [id - 7]);
    }
    if (id % 20 === 0) {
      const done = [...items.values()].filter((item) => item.done === 1);
      add(
        "SELECT count(*) AS n, total(priority) AS sum FROM item WHERE done = 1",
        [],
        [
          {
            n: done.length,
            sum: done.reduce((sum, item) => sum + item.priority, 0),
          },
        ],
      );
    }
    if (id % 25 === 0) {
      const word = words[id % words.length];
      add(
        "SELECT id FROM item WHERE title LIKE ? ORDER BY id",
        [`%${word}`],
        live()
          .filter(([, item]) => item.title.endsWith(word))
          .map(([itemId]) => ({ id: itemId })),
      );
      add(
        "SELECT count(*) AS n FROM item, json_each(item.tags) WHERE json_each.value = ?",
        [word],
        [
          {
            n: [...items.values()].filter((item) => item.tags.includes(word))
              .length,
          },
        ],
      );
    }
    if (id % 50 === 0)
      add(
        "SELECT id, row_number() OVER (ORDER BY priority DESC, id) AS rank FROM item ORDER BY rank LIMIT 5",
        [],
        live()
          .toSorted(([a, x], [b, y]) => y.priority - x.priority || a - b)
          .slice(0, 5)
          .map(([itemId], index) => ({ id: itemId, rank: index + 1 })),
      );
  }
  add(
    "SELECT count(*) AS n, sum(id) AS ids, group_concat(title, '|') AS titles FROM (SELECT * FROM item ORDER BY id)",
    [],
    [
      {
        n: items.size,
        ids: [...items.keys()].reduce((sum, id) => sum + id, 0),
        titles: live()
          .map(([, item]) => item.title)
          .join("|"),
      },
    ],
  );
  add("PRAGMA integrity_check", [], [{ integrity_check: "ok" }]);
  return statements;
};

test("a few hundred mixed statements on a File database complete, each returning what a model of the table expects", async () => {
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  okOrThrow(await worker.run("openPool", pool.directory));
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  const workload = createWorkload();
  assertTrue(workload.length > 250);

  const results = okOrThrow(
    await worker.run(
      "runStatements",
      database,
      workload.map(({ sql, parameters }) => ({ sql, parameters })),
    ),
  );

  for (const [index, { sql, expected }] of workload.entries())
    if (expected != null)
      assertEqual({ sql, rows: results[index] }, { sql, rows: expected });
});
