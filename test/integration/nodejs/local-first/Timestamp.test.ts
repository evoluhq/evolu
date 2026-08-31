import SQLite from "better-sqlite3";
import { test } from "node:test";
import { assertEqual } from "../../../../packages/common/src/Assert.ts";
import { orderNumber } from "../../../../packages/common/src/Order.ts";
import { testCreateDeps } from "../../../../packages/common/src/Task.ts";
import {
  createTimestamp,
  type TimestampBytes,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../../../packages/common/src/local-first/Timestamp.ts";
import type { Millis } from "../../../../packages/common/src/Time.ts";

test("preserves TimestampBytes order in SQLite", () => {
  const deps = testCreateDeps();
  const randomMillis = new Set<Millis>();
  for (let i = 0; i < 1000; i++) {
    randomMillis.add(deps.randomLib.int(0, 10000) as Millis);
  }

  const sortedMillis = [...randomMillis].toSorted(orderNumber);
  const timestamps = [...randomMillis]
    .map((millis) => createTimestamp({ millis }))
    .map(timestampToTimestampBytes);

  const db = new SQLite();
  db.prepare(
    `
      create table "Message" (
        "t" blob primary key
      )
      strict;
    `,
  ).run();

  const insertTimestamp = db.prepare(`insert into Message (t) values (@t)`);
  for (const timestamp of timestamps) insertTimestamp.run({ t: timestamp });

  const sqliteMillis = db
    .prepare<[], { t: TimestampBytes }>(`select t from Message order by t`)
    .all()
    .map(({ t }) => timestampBytesToTimestamp(t).millis);

  assertEqual(sqliteMillis, sortedMillis);
});
