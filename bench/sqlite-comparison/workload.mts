/**
 * What every stack runs on every platform: wa-sqlite's benchmark workloads, a
 * driver workload of many tiny prepared statements, and the pragmas every
 * connection sets. The Node.js runner, the web workers and the React Native app
 * share it, so it imports nothing platform-specific.
 *
 * @module
 */

/** The wa-sqlite commit whose benchmark SQL files the workloads are. */
export const waSqliteCommit = "663368072ad30a4a90c36ec4214ab43d15ea2639";

/**
 * SQLite's page cache of every connection, in KiB as a negative `cache_size`:
 * 16 MB, `@evolu/nodejs`'s and better-sqlite3's, which holds the largest
 * database the workloads build, so no stack spills its cache.
 */
export const cacheSize = -16000;

/**
 * The pragmas every connection runs right after it opens, untimed, in order, so
 * the stacks of a platform differ only in their SQLite build, binding and VFS.
 * `page_size` comes first, before anything creates a page.
 *
 * `temp_store` keeps temporary files in memory, where Evolu's builds always
 * keep them, and `secure_delete` is off, SQLite's default. An encrypted
 * connection keeps the `secure_delete` its encryption turns on, which is part
 * of what encryption costs.
 */
export const connectionPragmas = (
  encrypted: boolean,
): ReadonlyArray<string> => [
  "PRAGMA page_size = 4096",
  "PRAGMA journal_mode = DELETE",
  "PRAGMA synchronous = FULL",
  `PRAGMA cache_size = ${cacheSize}`,
  "PRAGMA temp_store = MEMORY",
  ...(encrypted ? [] : ["PRAGMA secure_delete = OFF"]),
];

/** The pragmas each run records after {@link connectionPragmas}. */
export const recordedPragmas = [
  "page_size",
  "journal_mode",
  "synchronous",
  "cache_size",
  "temp_store",
  "secure_delete",
  "locking_mode",
  "auto_vacuum",
  "mmap_size",
] as const;

/** The pragmas whose values may differ between a plain and an encrypted run. */
export const encryptionPragmas: ReadonlyArray<string> = ["secure_delete"];

/**
 * Splits SQL into its statements, each ending with its semicolon, at the
 * semicolons outside string literals, quoted identifiers and comments. A
 * fragment of only whitespace and comments is dropped, and the text after the
 * last semicolon is a statement when it has more.
 *
 * Every stack runs the statements one at a time, so the split happens before
 * the timed region, and no stack's multi-statement API is measured.
 */
export const splitStatements = (sql: string): ReadonlyArray<string> => {
  const statements: Array<string> = [];
  let start = 0;
  let hasToken = false;
  let index = 0;

  const skipPast = (terminator: string, from: number): number => {
    const end = sql.indexOf(terminator, from);
    return end === -1 ? sql.length : end + terminator.length;
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];
    if (char === "-" && next === "-") {
      index = skipPast("\n", index + 2);
    } else if (char === "/" && next === "*") {
      index = skipPast("*/", index + 2);
    } else if (char === "'" || char === '"' || char === "`") {
      hasToken = true;
      // A doubled quote escapes itself, which the next search starts after.
      let end = index;
      do end = skipPast(char, end + 1);
      while (sql[end] === char);
      index = end;
    } else if (char === "[") {
      hasToken = true;
      index = skipPast("]", index + 1);
    } else if (char === ";") {
      if (hasToken) statements.push(sql.slice(start, index + 1).trim());
      index++;
      start = index;
      hasToken = false;
    } else {
      if (char !== undefined && char.trim() !== "") hasToken = true;
      index++;
    }
  }
  if (hasToken) statements.push(sql.slice(start).trim());
  return statements;
};

/**
 * The driver workload: many tiny prepared statements, so it measures the cost
 * of each call into SQLite, which the bindings differ in, more than SQLite
 * itself. It runs on a fresh database of its own.
 *
 * 1. `insert`: {@link driverRowCount} single-row inserts with one prepared
 *    statement, in a write transaction.
 * 2. `selectByKey`: {@link driverPointSelectCount} point selects by primary key,
 *    keys from a seeded generator, with one prepared statement.
 * 3. `selectAll`: {@link driverSelectAllCount} reads of every row with one prepared
 *    statement, in the row form the library returns.
 *
 * The reads share a read transaction, so no statement takes and releases the
 * file's lock. BEGIN and COMMIT are not timed.
 */
export const driverOperations = ["insert", "selectByKey", "selectAll"] as const;
export type DriverOperation = (typeof driverOperations)[number];

export const driverRowCount = 10_000;
export const driverPointSelectCount = 10_000;
export const driverSelectAllCount = 10;

export const driverCreateSql =
  "CREATE TABLE kv (key INTEGER PRIMARY KEY, value TEXT NOT NULL)";
export const driverInsertSql = "INSERT INTO kv (key, value) VALUES (?, ?)";
export const driverSelectByKeySql = "SELECT value FROM kv WHERE key = ?";
export const driverSelectAllSql = "SELECT key, value FROM kv";

/** The value of the row with the key, 24 to 40 characters. */
export const driverValue = (key: number): string =>
  `value ${key} ${"x".repeat(key % 17)} ${(key * 2_654_435_761) % 4_294_967_296}`;

/**
 * The keys of the point selects, from a seeded generator (mulberry32), so every
 * stack reads the same rows in the same order.
 */
export const createDriverPointSelectKeys = (): ReadonlyArray<number> => {
  let seed = 42;
  const keys: Array<number> = [];
  for (let index = 0; index < driverPointSelectCount; index++) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- Wraps to 32 bits, which Math.trunc doesn't.
    seed = (seed + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const random = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    keys.push(1 + Math.floor(random * driverRowCount));
  }
  return keys;
};
