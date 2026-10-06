/**
 * The workload every stack runs, shared by the runner in Node.js and the stack
 * workers in the browser, so it must not import Node.js modules.
 *
 * @module
 */

/** One of wa-sqlite's benchmark SQL files, with the title its page shows. */
export interface Workload {
  readonly file: string;
  readonly title: string;
}

/** Where the workloads' files are in the wa-sqlite clone. */
export const workloadsPath = "demo/benchmarks/";

/**
 * The 16 workloads, which run in this order on one database: each depends on
 * the tables the previous ones left, and the last one drops them.
 */
export const workloads: ReadonlyArray<Workload> = [
  { file: "benchmark1.sql", title: "1000 INSERTs" },
  { file: "benchmark2.sql", title: "25000 INSERTs in a transaction" },
  { file: "benchmark3.sql", title: "25000 INSERTs into an indexed table" },
  { file: "benchmark4.sql", title: "100 SELECTs without an index" },
  { file: "benchmark5.sql", title: "100 SELECTs on a string comparison" },
  { file: "benchmark6.sql", title: "Creating an index" },
  { file: "benchmark7.sql", title: "5000 SELECTs with an index" },
  { file: "benchmark8.sql", title: "1000 UPDATEs without an index" },
  { file: "benchmark9.sql", title: "25000 UPDATEs with an index" },
  { file: "benchmark10.sql", title: "25000 text UPDATEs with an index" },
  { file: "benchmark11.sql", title: "INSERTs from a SELECT" },
  { file: "benchmark12.sql", title: "DELETE without an index" },
  { file: "benchmark13.sql", title: "DELETE with an index" },
  { file: "benchmark14.sql", title: "A big INSERT after a big DELETE" },
  {
    file: "benchmark15.sql",
    title: "A big DELETE followed by many small INSERTs",
  },
  { file: "benchmark16.sql", title: "DROP TABLE" },
];

/**
 * Runs on every fresh database before the workloads. It is the default of
 * wa-sqlite's benchmark page and the default of every stack, so it changes
 * nothing; the pragmas each stack then has are recorded with its results.
 */
export const preamble = "PRAGMA journal_mode=delete;";

/** The pragmas recorded after the preamble, as each stack defaults them. */
export const recordedPragmas = [
  "journal_mode",
  "synchronous",
  "page_size",
  "cache_size",
  "locking_mode",
  "temp_store",
  "secure_delete",
  "auto_vacuum",
] as const;

/**
 * Summarizes the rows of the three tables before the last workload drops them,
 * so a stack that skipped or mangled a write cannot pass.
 */
export const contentChecksumSql = `
  SELECT
    (SELECT count(*) || ',' || sum(a) || ',' || sum(b) || ',' || sum(length(c)) FROM t1)
    || ';' ||
    (SELECT count(*) || ',' || sum(a) || ',' || sum(b) || ',' || sum(length(c)) FROM t2)
    || ';' ||
    (SELECT count(*) || ',' || sum(a) || ',' || sum(b) || ',' || sum(length(c)) FROM t3)
`;

/**
 * A word in the numbers the workloads' rows spell out, which a plaintext file
 * can contain after the tables are dropped and an encrypted one never does.
 */
export const plaintextMarker = "thousand";
