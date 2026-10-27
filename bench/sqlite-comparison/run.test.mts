import {
  assertEqual,
  assertRejectsInstanceOf,
  assertTrue,
} from "@evolu/common";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import {
  runBench,
  type BenchAsyncApi,
  type BenchStack,
  type BenchSyncApi,
  type BenchSyncStatement,
} from "./run.mts";

const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-comparison-test-"));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** A stack on node:sqlite, whose API `toApi` can change. */
const createStack = (
  toApi: (api: BenchSyncApi) => BenchSyncApi | BenchAsyncApi = (api) => api,
): BenchStack => ({
  openDatabase: (name) => {
    const database = new DatabaseSync(join(directory, name));
    const api: BenchSyncApi = {
      type: "Sync",
      runOnce: (sql) => {
        database.exec(sql);
      },
      selectValue: (sql) => {
        const statement = database.prepare(sql);
        statement.setReturnArrays(true);
        return (statement.get() as ReadonlyArray<unknown> | undefined)?.[0];
      },
      prepare: (sql) => {
        const statement = database.prepare(sql);
        return {
          run: (parameters) => {
            statement.run(...parameters);
          },
          get: (parameters) => statement.get(...parameters),
          all: (parameters) => statement.all(...parameters),
          finalize: () => undefined,
        };
      },
    };
    return Promise.resolve({
      api: toApi(api),
      close: () => {
        database.close();
        return Promise.resolve();
      },
    });
  },
  readFile: (name) =>
    Promise.resolve(new Uint8Array(readFileSync(join(directory, name)))),
  deleteDatabase: (name) => {
    rmSync(join(directory, name), { force: true });
    return Promise.resolve();
  },
  dispose: () => Promise.resolve(),
});

const toAsync = (api: BenchSyncApi): BenchAsyncApi => ({
  type: "Async",
  runOnce: (sql) => Promise.resolve(api.runOnce(sql)),
  selectValue: (sql) => Promise.resolve(api.selectValue(sql)),
  prepare: (sql) => {
    const statement = api.prepare(sql);
    return Promise.resolve({
      run: (parameters) => Promise.resolve(statement.run(parameters)),
      get: (parameters) => Promise.resolve(statement.get(parameters)),
      all: (parameters) => Promise.resolve(statement.all(parameters)),
      finalize: () => Promise.resolve(statement.finalize()),
    });
  },
});

// Small workloads, the last dropping the tables, as wa-sqlite's do.
const workloads = [
  ["CREATE TABLE t1(a INTEGER, b INTEGER, c TEXT);"],
  [
    "INSERT INTO t1 VALUES(1, 2, 'one thousand');",
    "INSERT INTO t1 VALUES(2, 3, 'two');",
  ],
  ["CREATE TABLE t2(a, b, c);", "CREATE TABLE t3(a, b, c);"],
  ["DROP TABLE t1;", "DROP TABLE t2;", "DROP TABLE t3;"],
];

describe("runBench", () => {
  for (const [type, toApi] of [
    ["synchronous", undefined],
    ["asynchronous", toAsync],
  ] as const)
    it(`runs the workloads and the driver workload on a ${type} API`, async () => {
      const output = await runBench(createStack(toApi), {
        name: `run-${type}`,
        workloads,
        encrypted: false,
        verifyContent: false,
      });
      assertEqual(output.workloadMs.length, workloads.length);
      assertEqual(output.totalChanges, [0, 2, 2, 2]);
      assertEqual(output.schemaObjectsAfter, 0);
      assertEqual(output.contentChecksum, null);
      assertEqual(output.pragmas.cache_size, "-16000");
      assertEqual(output.pragmas.secure_delete, "0");
      assertEqual(output.file?.sqliteHeaderOffsets[0], 0);
      assertTrue(output.file?.containsPlaintextMarker === true);
      assertTrue(output.sqliteSourceId.length > 0);
      assertTrue(Object.values(output.driverMs).every((ms) => ms >= 0));
    });

  it("checksums the tables before the last workload when asked", async () => {
    const tables = [
      "CREATE TABLE t1(a, b, c);",
      "CREATE TABLE t2(a, b, c);",
      "CREATE TABLE t3(a, b, c);",
      "INSERT INTO t1 VALUES(1, 2, 'xy');",
      "INSERT INTO t2 VALUES(2, 3, 'abc');",
      "INSERT INTO t3 VALUES(4, 5, '');",
    ];
    const output = await runBench(createStack(), {
      name: "run-checksum",
      workloads: [
        tables,
        ["DROP TABLE t1;", "DROP TABLE t2;", "DROP TABLE t3;"],
      ],
      encrypted: false,
      verifyContent: true,
    });
    assertEqual(output.contentChecksum, "1,1,2,2;1,2,3,3;1,4,5,0");
  });

  it("leaves secure_delete to an encrypted connection", async () => {
    const output = await runBench(
      createStack((api) => ({
        ...api,
        runOnce: (sql) => {
          if (sql.includes("secure_delete"))
            throw new Error("An encrypted connection set secure_delete.");
          api.runOnce(sql);
        },
      })),
      {
        name: "run-encrypted",
        workloads,
        encrypted: true,
        verifyContent: false,
      },
    );
    assertEqual(output.pragmas.secure_delete, "0");
  });

  it("fails when a point select reads another value", async () => {
    const wrongReads = createStack((api) => ({
      ...api,
      prepare: (sql): BenchSyncStatement => {
        const statement = api.prepare(sql);
        return { ...statement, get: () => ({ value: "wrong" }) };
      },
    }));
    const error = await assertRejectsInstanceOf(
      runBench(wrongReads, {
        name: "run-wrong",
        workloads,
        encrypted: false,
        verifyContent: false,
      }),
      Error,
    );
    assertTrue(error.message.endsWith("read wrong."));
  });

  it("fails when the reads of every row read other rows", async () => {
    const fewerRows = createStack((api) => ({
      ...api,
      prepare: (sql): BenchSyncStatement => {
        const statement = api.prepare(sql);
        return {
          ...statement,
          all: (parameters) => statement.all(parameters).slice(1),
        };
      },
    }));
    const error = await assertRejectsInstanceOf(
      runBench(fewerRows, {
        name: "run-fewer",
        workloads,
        encrypted: false,
        verifyContent: false,
      }),
      Error,
    );
    assertTrue(error.message.startsWith("The reads of every row read"));
  });
});
