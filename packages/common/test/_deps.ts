import { TimingSafeEqual } from "@evolu/common";
import BetterSQLite, { Statement } from "better-sqlite3";
import { timingSafeEqual } from "crypto";
import { customRandom, urlAlphabet } from "nanoid";
import {
  CreateMnemonic,
  CreateMnemonicDep,
  CreateRandomBytesDep,
  createSymmetricCrypto,
  mnemonicToMnemonicSeed,
  RandomBytes,
  SymmetricCryptoDep,
} from "../src/Crypto.js";
import { Config, defaultConfig } from "../src/Evolu/Config.js";
import {
  createAppOwner,
  createOwner,
  createOwnerRow,
  Owner,
} from "../src/Evolu/Owner.js";
import { ownerIdToBinaryOwnerId } from "../src/Evolu/Protocol.js";
import { constVoid } from "../src/Function.js";
import { NanoIdLib } from "../src/NanoId.js";
import {
  createRandomLibWithSeed,
  createRandomWithSeed,
} from "../src/Random.js";
import { getOrThrow } from "../src/Result.js";
import {
  createPreparedStatementsCache,
  createSqlite,
  CreateSqliteDriver,
  Sqlite,
  SqliteDriver,
  SqliteRow,
} from "../src/Sqlite.js";
import { createTestTime, TimeDep } from "../src/Time.js";
import { createId, Id, Mnemonic, SimpleName } from "../src/Type.js";
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

export const testMnemonic = getOrThrow(
  Mnemonic.from(
    "knee easy fork attitude drink gloom head latin spider grab spy reason",
  ),
);

export const testMnemonic2 = getOrThrow(
  Mnemonic.from(
    "borrow movie sniff dismiss only speak ethics material judge machine return snack",
  ),
);

export const testCreateMnemonic: CreateMnemonic = () => testMnemonic;
export const testCreateMnemonic2: CreateMnemonic = () => testMnemonic2;

export const testMnemonicSeed = mnemonicToMnemonicSeed(testMnemonic);

export const testDbConfig: Config = {
  ...defaultConfig,
  mnemonic: testMnemonic,
};

export const testCreateRandomBytesDep: CreateRandomBytesDep = {
  createRandomBytes: (bytesLength = 32) => {
    const array = Array.from({ length: bytesLength }, () =>
      testRandomLib.int(0, 255),
    );
    return new Uint8Array(array) as RandomBytes;
  },
};

export const testCreateRandomBytesDep2: CreateRandomBytesDep = {
  createRandomBytes: (bytesLength = 32) => {
    const array = Array.from({ length: bytesLength }, () =>
      testRandomLib2.int(0, 255),
    );
    return new Uint8Array(array) as RandomBytes;
  },
};

const ownerDeps = {
  time: testTime,
  ...testCreateRandomBytesDep,
  createMnemonic: testCreateMnemonic,
  nanoIdLib: testNanoIdLib,
};

export const testOwner: Owner = createOwner(ownerDeps)(testMnemonic);

const appOwner = createAppOwner(ownerDeps)();
export const testOwnerRow = createOwnerRow(ownerDeps)(appOwner);

export const testOwnerBinaryId = ownerIdToBinaryOwnerId(testOwner.id);

export const testOwner2: Owner = createOwner({
  time: testTime,
  ...testCreateRandomBytesDep2,
  createMnemonic: testCreateMnemonic2,
})(testMnemonic2);

export const testSymmetricCrypto = createSymmetricCrypto(
  testCreateRandomBytesDep,
);

export const testDeps: TimeDep &
  CreateRandomBytesDep &
  CreateMnemonicDep &
  SymmetricCryptoDep = {
  ...ownerDeps,
  symmetricCrypto: testSymmetricCrypto,
};

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

export const testSimpleName = getOrThrow(SimpleName.from("Test"));

export const testCreateSqlite = async (): Promise<Sqlite> => {
  const sqlite = await createSqlite({
    createSqliteDriver: testCreateSqliteDriver,
  })(testSimpleName);
  return getOrThrow(sqlite);
};

export const testCreateTimingSafeEqual = (): TimingSafeEqual => timingSafeEqual;
