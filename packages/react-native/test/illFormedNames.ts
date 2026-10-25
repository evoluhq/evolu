/**
 * Writes the database of `bindingConformance.ts`'s ill-formed names, which a
 * host of the suite writes with Node.js's SQLite, since the binding's
 * connections are defensive and ignore `writable_schema`.
 *
 * @module
 */
import { DatabaseSync } from "node:sqlite";

/**
 * Writes at `path` table `t`, whose columns and check constraint have names
 * with a byte 0xff, which no UTF-8 sequence has, and the row (1, 2).
 */
export const writeIllFormedNamesDatabase = (path: string): void => {
  const ff = "' || cast(x'ff' as text) || '";
  // Node.js's SQLite is defensive by default too.
  const database = new DatabaseSync(path, { defensive: false });
  try {
    database.exec(
      `create table t (a, b, constraint c check (a > 0));
      insert into t values (1, 2);
      pragma writable_schema = 1;
      update sqlite_schema set sql = 'create table t ("a${ff}b", "a${ff}c", constraint "c${ff}d" check ("a${ff}b" > 0))' where name = 't';`,
    );
  } finally {
    database.close();
  }
};
