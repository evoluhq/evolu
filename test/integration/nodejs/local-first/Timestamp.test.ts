import { test } from "node:test";
import { assertEqual } from "../../../../packages/common/src/Assert.ts";
import { orderNumber } from "../../../../packages/common/src/Order.ts";
import { sql } from "../../../../packages/common/src/Sqlite.ts";
import { testCreateDeps } from "../../../../packages/common/src/Task.ts";
import {
  createTimestamp,
  type TimestampBytes,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../../../packages/common/src/local-first/Timestamp.ts";
import type { Millis } from "../../../../packages/common/src/Time.ts";
import { setupSqlite } from "../_deps.ts";

test("preserves TimestampBytes order in SQLite", async () => {
  const deps = testCreateDeps();
  const randomMillis = new Set<Millis>();
  for (let i = 0; i < 1000; i++) {
    randomMillis.add(deps.randomLib.int(0, 10000) as Millis);
  }

  const sortedMillis = [...randomMillis].toSorted(orderNumber);
  const timestamps = [...randomMillis]
    .map((millis) => createTimestamp({ millis }))
    .map(timestampToTimestampBytes);

  await using setup = await setupSqlite();
  const { sqlite } = setup;
  sqlite.exec(sql`
    create table "Message" (
      "t" blob primary key
    )
    strict;
  `);
  for (const timestamp of timestamps)
    sqlite.exec(sql`insert into "Message" ("t") values (${timestamp});`);

  const sqliteMillis = sqlite
    .exec<{ t: TimestampBytes }>(sql`select "t" from "Message" order by "t";`)
    .rows.map(({ t }) => timestampBytesToTimestamp(t).millis);

  assertEqual(sqliteMillis, sortedMillis);
});
