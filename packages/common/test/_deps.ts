import { CreateWebSocket, TimingSafeEqual } from "@evolu/common";
import BetterSQLite, { Statement } from "better-sqlite3";
import { timingSafeEqual } from "crypto";
import { customRandom, urlAlphabet } from "nanoid";
import {
  createSymmetricCrypto,
  RandomBytes,
  RandomBytesDep,
  SymmetricCryptoDep,
} from "../src/Crypto.js";
import { Config, defaultConfig } from "../src/Evolu/Config.js";
import {
  createAppOwner,
  createOwner,
  createOwnerSecret,
  ownerIdToBinaryOwnerId,
} from "../src/Evolu/Owner.js";
import { constFalse, constVoid } from "../src/Function.js";
import { NanoIdLib, NanoIdLibDep } from "../src/NanoId.js";
import {
  createRandomLibWithSeed,
  createRandomWithSeed,
} from "../src/Random.js";
import { getOrThrow, ok } from "../src/Result.js";
import {
  createPreparedStatementsCache,
  createSqlite,
  CreateSqliteDriver,
  Sqlite,
  SqliteDriver,
  SqliteRow,
} from "../src/Sqlite.js";
import { createTestTime, TimeDep } from "../src/Time.js";
import { createId, Id, SimpleName } from "../src/Type.js";
// import { existsSync, unlinkSync } from "fs";

export const testRandom = createRandomWithSeed("evolu");
export const testTime = createTestTime();

export const testRandomLib = createRandomLibWithSeed("evolu").random;
export const testRandomLib2 = createRandomLibWithSeed("forever").random;

// Test nanoids are unique only for a few thousands of iterations.
// https://github.com/transitive-bullshit/random/issues/45
export const testNanoIdLib: NanoIdLib = {
  urlAlphabet,
  nanoid: customRandom(urlAlphabet, 21, (size) =>
    new Uint8Array(size).map(() => testRandomLib.int(0, 255)),
  ),
  customAlphabet: (alphabet, defaultSize = 21) =>
    customRandom(alphabet, defaultSize, (size) =>
      new Uint8Array(size).map(() => testRandomLib.int(0, 255)),
    ),
};

export const testNanoIdLib2: NanoIdLib = {
  urlAlphabet,
  nanoid: customRandom(urlAlphabet, 21, (size) =>
    new Uint8Array(size).map(() => testRandomLib2.int(0, 255)),
  ),
  customAlphabet: (alphabet, defaultSize = 21) =>
    customRandom(alphabet, defaultSize, (size) =>
      new Uint8Array(size).map(() => testRandomLib2.int(0, 255)),
    ),
};

export const testNanoIdLibDep = { nanoIdLib: testNanoIdLib };

export const testCreateId = (): Id => createId(testNanoIdLibDep);

export const testRandomBytes: RandomBytes = {
  create: (bytesLength) => {
    const array = Array.from({ length: bytesLength }, () =>
      testRandomLib.int(0, 255),
    );
    return new Uint8Array(array);
  },
} as RandomBytes;

const randomBytesDep = { randomBytes: testRandomBytes };

export const testOwnerSecret = createOwnerSecret(randomBytesDep);
export const testOwnerSecret2 = createOwnerSecret(randomBytesDep);

export const testDbConfig: Config = {
  ...defaultConfig,
  externalAppOwner: createAppOwner(testOwnerSecret),
};

export const testSymmetricCrypto = createSymmetricCrypto(randomBytesDep);

type TestDeps = NanoIdLibDep & RandomBytesDep & SymmetricCryptoDep & TimeDep;

export const testDeps: TestDeps = {
  nanoIdLib: testNanoIdLib,
  randomBytes: testRandomBytes,
  symmetricCrypto: testSymmetricCrypto,
  time: testTime,
};

export const testOwner = createOwner(testOwnerSecret);
export const testOwnerBinaryId = ownerIdToBinaryOwnerId(testOwner.id);

export const testOwner2 = createOwner(testOwnerSecret2);

//   /**
//    * Log for SQL.
//    *
//    * - `select log(a) from foo`
//    */
//   db.function("log", (msg) => {
//     // eslint-disable-next-line no-console
//     console.log(msg);
//   });
export const testCreateSqliteDriver: CreateSqliteDriver = () => {
  // TODO: Param for benchmark tests and delete that file after.
  // const dbFile = "test.db";
  // if (existsSync(dbFile)) unlinkSync(dbFile);
  // const db = new BetterSQLite(dbFile);
  const db = new BetterSQLite(":memory:");
  let isDisposed = false;

  const cache = createPreparedStatementsCache<Statement>(
    (sql) => db.prepare(sql),
    // Not needed.
    // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
    constVoid,
  );

  const driver: SqliteDriver = {
    exec: (query, isMutation) => {
      // Always prepare is recommended for better-sqlite3
      const prepared = cache.get(query, true);

      const rows = isMutation
        ? []
        : (prepared.all(query.parameters) as Array<SqliteRow>);

      const changes = isMutation ? prepared.run(query.parameters).changes : 0;

      return { rows, changes };
    },

    export: () => db.serialize(),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache[Symbol.dispose]();
      db.close();
    },
  };

  return Promise.resolve(driver);
};

export const testSimpleName = SimpleName.fromOrThrow("Test");

export const testCreateSqlite = async (): Promise<Sqlite> => {
  const sqlite = await createSqlite({
    createSqliteDriver: testCreateSqliteDriver,
  })(testSimpleName);
  return getOrThrow(sqlite);
};

export const testCreateTimingSafeEqual = (): TimingSafeEqual => timingSafeEqual;

export const testCreateDummyWebSocket: CreateWebSocket = () => ({
  send: () => ok(),
  getReadyState: () => "connecting",
  isOpen: constFalse,
  [Symbol.dispose]: constVoid,
});
