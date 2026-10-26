/**
 * The conformance suite of Evolu's native SQLite binding, the interface that
 * `@evolu/common`'s `NativeSqlite.ts` types, which every adapter of it passes:
 * the N-API mirror of `@evolu/sqlite-core` in Node.js, and the JSI adapter
 * under Hermes and on devices.
 *
 * It has no runtime imports, so a host compiles it as it is, takes the binding
 * and the test and assert functions as parameters, and declares nothing with
 * `using`, which Hermes runs only after Babel. Its files live in a directory
 * the host gives it, and it reads and writes them only through the binding.
 *
 * @module
 */
import type {
  NativeSqlite,
  NativeSqliteDatabase,
  NativeSqliteRunResult,
  NativeSqliteStatement,
  SqliteExecResult,
  SqliteValue,
} from "@evolu/common";

/** A value the suite binds, whose numbers are finite without the brand. */
type TestValue = null | number | string | Uint8Array;

const values = (...parameters: Array<TestValue>): ReadonlyArray<SqliteValue> =>
  parameters as ReadonlyArray<SqliteValue>;

/** What {@link describeBindingConformance} takes. */
export interface BindingConformanceDeps {
  readonly binding: NativeSqlite;
  /** The `abiVersion` the loader expects. */
  readonly abiVersion: number;
  /**
   * An absolute path, without a trailing slash, of an empty directory for the
   * suite's files.
   */
  readonly directory: string;
  /**
   * The path of the database `illFormedNames.ts` writes, whose table `t` has
   * columns named `a\xffb` and `a\xffc` and the check constraint `c\xffd`, with
   * a byte 0xff, which no UTF-8 sequence has. The host writes it with another
   * SQLite, since the binding's connections are defensive and ignore
   * `writable_schema`.
   */
  readonly illFormedNames: string;
  /**
   * Whether run, bind and database run take a Proxy of an array as their
   * parameters, as JSI's `isArray` sees one, or refuse it, as Node-API's
   * `napi_is_array` does.
   */
  readonly acceptsProxyArrays: boolean;
  /** Registers a test, which fails when its function throws. */
  readonly test: (name: string, fn: () => void) => unknown;
  /** Throws unless the values are equal as data. */
  readonly assertEqual: (actual: unknown, expected: unknown) => void;
}

/**
 * The XChaCha20-Poly1305 vectors of `@evolu/sqlite-core`'s
 * `test/xchacha_vectors.h`, which noble's output gave: the plaintext's length,
 * the tag, and the 64-bit FNV-1a checksum of the ciphertext. The key, nonce and
 * plaintext follow the formulas of {@link xchachaVectorInputs}.
 */
export const xchachaVectors: ReadonlyArray<{
  readonly length: number;
  readonly tag: string;
  readonly checksum: bigint;
}> = [
  {
    length: 0,
    tag: "ff5e8d4641693f5552017285a10e94b9",
    checksum: 0xcbf29ce484222325n,
  },
  {
    length: 1,
    tag: "c11e01d5f44f456f5ed3ce242396ffb4",
    checksum: 0xaf646e4c8602e4a2n,
  },
  {
    length: 15,
    tag: "4b63ac2aa4951d5e922833d4c258f672",
    checksum: 0xb7e847b3b2aee803n,
  },
  {
    length: 16,
    tag: "f60d528480c2f2af1831b13c615ab4fd",
    checksum: 0x561f0125019bba36n,
  },
  {
    length: 17,
    tag: "afc6135dd47ec9147aa9fdd4be1b8926",
    checksum: 0x78b94a752eb4bfefn,
  },
  {
    length: 255,
    tag: "3e961b7824374531c503a6a28d3ce00d",
    checksum: 0xd57050719db652fbn,
  },
  {
    length: 1024,
    tag: "5b90f2bc65c4be6aac302deca45d0358",
    checksum: 0x2e27710898020ee1n,
  },
  {
    length: 65536,
    tag: "d67812653c9e96f0c44c23f1f68f47fc",
    checksum: 0xd4036bb7d93e8803n,
  },
];

/**
 * The key, nonce and plaintext of the vector at `index`, by the formulas of
 * `xchacha-vectors.test.mts`.
 */
export const xchachaVectorInputs = (
  index: number,
  length: number,
): {
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
  readonly plaintext: Uint8Array;
} => ({
  key: Uint8Array.from(
    { length: 32 },
    (_, i) => (i * 7 + index * 11 + 1) & 0xff,
  ),
  nonce: Uint8Array.from(
    { length: 24 },
    (_, i) => (i * 13 + index * 5 + 2) & 0xff,
  ),
  plaintext: Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 0xff),
});

/**
 * How many values a call of the Node-API binding passes as its arguments, its
 * ARGUMENT_VALUES, which passes the others in a buffer, so the tests of larger
 * results exceed it.
 */
export const nodeArgumentValues = 1024;

/**
 * How many of the texts and blobs after the first {@link nodeArgumentValues}
 * that the Node-API binding creates a call of its takeTexts takes, its
 * TEXT_CHUNK.
 */
export const nodeTextChunk = 256;

/**
 * The fewest bytes of a text that isn't ASCII which the Node-API binding's row
 * builder decodes after the first {@link nodeArgumentValues}, its DECODED_TEXT,
 * where the binding creates a shorter one that isn't a short text: of 13 bytes
 * or more, or not well-formed UTF-8.
 */
export const nodeDecodedText = 76;

/**
 * The fewest bytes of a blob after the first {@link nodeArgumentValues} that the
 * Node-API binding creates with a buffer of its own and passes to takeTexts,
 * its OWN_BLOB, where a shorter one's bytes are in the call's buffer.
 */
export const nodeOwnBlob = 64;

/** Registers the conformance tests of an adapter's binding. */
export const describeBindingConformance = ({
  binding,
  abiVersion,
  directory,
  illFormedNames,
  acceptsProxyArrays,
  test,
  assertEqual,
}: BindingConformanceDeps): void => {
  const pathOf = (name: string): string => `${directory}/${name}`;

  /** What `fn` throws, as data: its class, message and cause. */
  const thrownBy = (fn: () => unknown): unknown => {
    let thrown: unknown = null;
    let didThrow = false;
    try {
      fn();
    } catch (error) {
      thrown = error;
      didThrow = true;
    }
    if (!didThrow) throw new Error("Expected a throw.");
    if (!(thrown instanceof Error)) return { thrown };
    return {
      kind: thrown instanceof TypeError ? "TypeError" : "Error",
      message: thrown.message,
      cause: thrown.cause,
    };
  };

  /** A TypeError with `message`, as {@link thrownBy} describes it. */
  const typeError = (message: string) => ({
    kind: "TypeError",
    message,
    cause: undefined,
  });

  /** An Error with a cause, as {@link thrownBy} describes it. */
  const errorWith = (message: string, cause: unknown) => ({
    kind: "Error",
    message,
    cause,
  });

  /** The cause of an error SQLite reported. */
  const sqliteError = ({
    operation,
    extendedCode,
    message,
    sqlOffset = null,
    systemErrno = null,
    cause = null,
  }: {
    operation: string;
    extendedCode: number;
    message: string;
    sqlOffset?: number | null;
    systemErrno?: number | null;
    cause?: unknown;
  }) =>
    errorWith(message, {
      type: "SqliteError",
      operation,
      extendedCode,
      message,
      sqlOffset,
      systemErrno,
      cause,
    });

  const heldError = errorWith(
    "Another connection of this process has the database open.",
    { type: "DatabaseFileHeldError" },
  );

  const pageAuthenticationFailure = (pageNumber: number) => ({
    type: "SqliteCodecFailure",
    error: { type: "SqlitePageAuthenticationError", pageNumber },
  });

  /**
   * What a run returned, as a {@link SqliteExecResult}, which a run returns
   * itself only when it returned and changed rows.
   */
  const execResultOf = (result: NativeSqliteRunResult): SqliteExecResult =>
    typeof result === "number"
      ? { rows: [], changes: result }
      : Array.isArray(result)
        ? { rows: result as SqliteExecResult["rows"], changes: 0 }
        : (result as SqliteExecResult);

  /** Prepares, runs and finalizes one statement. */
  const run = (
    database: NativeSqliteDatabase,
    sql: string,
    parameters: ReadonlyArray<TestValue> = [],
  ) => {
    const statement = database.prepare(sql);
    try {
      return execResultOf(statement.run(values(...parameters)));
    } finally {
      statement.finalize();
    }
  };

  const rowsOf = (database: NativeSqliteDatabase, sql: string) =>
    run(database, sql).rows;

  /**
   * Whether a row inherits nothing: its prototype is null, or a frozen, empty
   * object without one, whose objects V8 keeps faster.
   */
  const inheritsNothing = (row: object | undefined): boolean => {
    const prototype = Object.getPrototypeOf(row) as object | null;
    return (
      prototype === null ||
      (Object.isFrozen(prototype) &&
        Reflect.ownKeys(prototype).length === 0 &&
        Object.getPrototypeOf(prototype) === null)
    );
  };

  const key = Uint8Array.from({ length: 32 }, (_, i) => i * 3 + 1);
  const otherKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);

  const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  // "SQLite format 3" and its NUL, which starts every plaintext database.
  const sqliteHeader = "53514c69746520666f726d6174203300";

  test("abiVersion is the version of the interface the loader expects", () => {
    assertEqual(binding.abiVersion, abiVersion);
  });

  test("fillRandom fills exactly the bytes of a Uint8Array's view with random bytes", () => {
    const bytes = new Uint8Array(96);
    const view = bytes.subarray(16, 80);

    assertEqual(binding.fillRandom(view), undefined);

    assertEqual(bytesToHex(bytes.subarray(0, 16)), "00".repeat(16));
    assertEqual(bytesToHex(bytes.subarray(80)), "00".repeat(16));
    // 64 zero bytes have a chance of 2^-512.
    assertEqual(
      view.some((byte) => byte !== 0),
      true,
    );
    const other = new Uint8Array(64);
    binding.fillRandom(other);
    assertEqual(bytesToHex(other) === bytesToHex(view), false);
    binding.fillRandom(new Uint8Array(0));
  });

  test("fillRandom throws a TypeError for anything but a Uint8Array", () => {
    for (const value of [
      undefined,
      null,
      new Uint16Array(4),
      new ArrayBuffer(4),
      [0, 0],
    ])
      assertEqual(
        thrownBy(() => {
          binding.fillRandom(value as never);
        }),
        typeError("The bytes must be a Uint8Array."),
      );
  });

  test("encryptXChaCha20Poly1305 matches noble's output for the core's vectors, and decryptXChaCha20Poly1305 reverses it", () => {
    for (const [index, vector] of xchachaVectors.entries()) {
      const { key, nonce, plaintext } = xchachaVectorInputs(
        index,
        vector.length,
      );

      const output = binding.encryptXChaCha20Poly1305(key, nonce, plaintext);

      // An output of its own, the ciphertext followed by the tag.
      assertEqual(output instanceof Uint8Array, true);
      assertEqual(
        [output.byteOffset, output.buffer.byteLength],
        [0, vector.length + 16],
      );
      assertEqual(bytesToHex(output.subarray(vector.length)), vector.tag);
      let checksum = 0xcbf29ce484222325n;
      for (const byte of output.subarray(0, vector.length))
        checksum =
          ((checksum ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
      assertEqual(checksum, vector.checksum);
      const decrypted = binding.decryptXChaCha20Poly1305(key, nonce, output);
      assertEqual(decrypted.byteOffset, 0);
      assertEqual(bytesToHex(decrypted), bytesToHex(plaintext));
    }
  });

  test("decryptXChaCha20Poly1305 throws for a forged tag or ciphertext, another key or nonce, and an input shorter than a tag", () => {
    const { key, nonce, plaintext } = xchachaVectorInputs(4, 17);
    const output = binding.encryptXChaCha20Poly1305(key, nonce, plaintext);
    const flipped = (bytes: Uint8Array, at: number) => {
      const copy = bytes.slice();
      copy[at] ^= 1;
      return copy;
    };
    const notAuthentic = {
      kind: "Error",
      message: "The ciphertext doesn't authenticate.",
      cause: undefined,
    };

    for (const [decryptKey, decryptNonce, input] of [
      [key, nonce, flipped(output, 0)],
      [key, nonce, flipped(output, 17 + 15)],
      [flipped(key, 31), nonce, output],
      [key, flipped(nonce, 23), output],
      [key, nonce, output.subarray(0, 15)],
      [key, nonce, new Uint8Array(0)],
    ] as const)
      assertEqual(
        thrownBy(() =>
          binding.decryptXChaCha20Poly1305(decryptKey, decryptNonce, input),
        ),
        notAuthentic,
      );
    // The tag alone authenticates an empty plaintext.
    const empty = binding.encryptXChaCha20Poly1305(
      key,
      nonce,
      new Uint8Array(0),
    );
    assertEqual(binding.decryptXChaCha20Poly1305(key, nonce, empty).length, 0);
  });

  test("encryptXChaCha20Poly1305 and decryptXChaCha20Poly1305 throw a TypeError for a key or nonce of the wrong length, or an input that isn't a Uint8Array", () => {
    const { key, nonce, plaintext } = xchachaVectorInputs(1, 1);
    const keyError = typeError("The key must be a Uint8Array of 32 bytes.");
    const nonceError = typeError("The nonce must be a Uint8Array of 24 bytes.");

    for (const crypt of [
      binding.encryptXChaCha20Poly1305,
      binding.decryptXChaCha20Poly1305,
    ]) {
      for (const wrongKey of [
        key.subarray(1),
        new Uint8Array(33),
        new Uint16Array(16),
        new ArrayBuffer(32),
        null,
      ])
        assertEqual(
          thrownBy(() => crypt(wrongKey as never, nonce, plaintext)),
          keyError,
        );
      for (const wrongNonce of [
        nonce.subarray(1),
        new Uint8Array(25),
        new Uint32Array(6),
        undefined,
      ])
        assertEqual(
          thrownBy(() => crypt(key, wrongNonce as never, plaintext)),
          nonceError,
        );
      for (const input of [[1, 2], new Uint16Array(8), "text", null])
        assertEqual(
          thrownBy(() => crypt(key, nonce, input as never)),
          typeError("The input must be a Uint8Array."),
        );
    }
  });

  test("openMemory opens a database of its own each time", () => {
    const first = binding.openMemory();
    const second = binding.openMemory();
    try {
      run(first, "create table t (a)");

      assertEqual(rowsOf(first, "select count(*) as n from sqlite_schema"), [
        { n: 1 },
      ]);
      assertEqual(rowsOf(second, "select count(*) as n from sqlite_schema"), [
        { n: 0 },
      ]);
    } finally {
      first.close();
      second.close();
    }
  });

  test("the binding's functions work called without the binding", () => {
    const {
      openMemory,
      openFile,
      openEncryptedFile,
      isFileOpen,
      deleteFile,
      fillRandom,
      encryptXChaCha20Poly1305,
      decryptXChaCha20Poly1305,
    } = binding;
    const plain = pathOf("unbound-plain.db");
    const encrypted = pathOf("unbound-encrypted.db");

    for (const database of [
      openMemory(),
      openFile(plain),
      openEncryptedFile(encrypted, key),
    ]) {
      assertEqual(rowsOf(database, "select 1 as a"), [{ a: 1 }]);
      database.close();
    }
    assertEqual(isFileOpen(plain), false);
    deleteFile(plain);
    fillRandom(new Uint8Array(1));
    const { nonce, plaintext } = xchachaVectorInputs(2, 15);
    assertEqual(
      bytesToHex(
        decryptXChaCha20Poly1305(
          key,
          nonce,
          encryptXChaCha20Poly1305(key, nonce, plaintext),
        ),
      ),
      bytesToHex(plaintext),
    );
  });

  test("openFile creates a missing directory's last level and the file, which reopens with its rows", () => {
    const path = pathOf("created/plain.db");
    const created = binding.openFile(path);
    run(created, "create table t (a)");
    run(created, "insert into t values (?)", ["kept"]);
    created.close();

    const reopened = binding.openFile(path);
    try {
      assertEqual(rowsOf(reopened, "select a from t"), [{ a: "kept" }]);
    } finally {
      reopened.close();
    }
  });

  test("openFile opens plain SQLite on the default VFS, which can use WAL, unlike openEncryptedFile on the codec", () => {
    const plain = binding.openFile(pathOf("plain-wal.db"));
    const encrypted = binding.openEncryptedFile(
      pathOf("encrypted-wal.db"),
      key,
    );
    try {
      assertEqual(rowsOf(plain, "pragma journal_mode = wal"), [
        { journal_mode: "wal" },
      ]);
      run(plain, "create table t (a)");
      run(plain, "insert into t values (?)", ["wal"]);
      assertEqual(rowsOf(plain, "select a from t"), [{ a: "wal" }]);
      assertEqual(rowsOf(encrypted, "pragma journal_mode = wal"), [
        { journal_mode: "delete" },
      ]);
    } finally {
      plain.close();
      encrypted.close();
    }
  });

  test("openEncryptedFile reopens with its key, and another key fails with NOTADB and page 1's authentication failure and changes nothing (G10)", () => {
    const path = pathOf("encrypted.db");
    const created = binding.openEncryptedFile(path, key);
    run(created, "create table t (a)");
    run(created, "insert into t values (?)", ["secret"]);
    created.close();

    assertEqual(
      thrownBy(() => binding.openEncryptedFile(path, otherKey)),
      sqliteError({
        operation: "open",
        extendedCode: 26,
        message: "file is not a database",
        cause: pageAuthenticationFailure(1),
      }),
    );
    assertEqual(binding.isFileOpen(path), false);
    const reopened = binding.openEncryptedFile(path, key);
    try {
      assertEqual(rowsOf(reopened, "select a from t"), [{ a: "secret" }]);
    } finally {
      reopened.close();
    }
  });

  test("openEncryptedFile takes the key's view, not its buffer", () => {
    const path = pathOf("key-view.db");
    const buffer = new Uint8Array(40);
    buffer.set(key, 4);
    const created = binding.openEncryptedFile(path, buffer.subarray(4, 36));
    run(created, "create table t (a)");
    created.close();

    const reopened = binding.openEncryptedFile(path, key.slice());
    reopened.close();
  });

  test("openEncryptedFile throws a TypeError unless the key is a Uint8Array of exactly 32 bytes (G9)", () => {
    const path = pathOf("key-validation.db");
    for (const wrongKey of [
      undefined,
      null,
      "x".repeat(32),
      key.subarray(1),
      new Uint8Array(33),
      new Uint16Array(16),
      new ArrayBuffer(32),
      Array.from(key),
    ])
      assertEqual(
        thrownBy(() => binding.openEncryptedFile(path, wrongKey as never)),
        typeError("The key must be a Uint8Array of 32 bytes."),
      );
    assertEqual(binding.isFileOpen(path), false);
  });

  test("an open of a file another connection holds fails with DatabaseFileHeldError, also through another spelling of its path, until that connection closes", () => {
    const path = pathOf("held.db");
    const holder = binding.openEncryptedFile(path, key);
    run(holder, "create table t (a)");

    for (const open of [
      () => binding.openFile(path),
      () => binding.openEncryptedFile(path, key),
      () => binding.openFile(`${directory}/./held.db`),
      () => binding.openFile(`${directory}//held.db`),
    ])
      assertEqual(thrownBy(open), heldError);

    holder.close();
    const reopened = binding.openEncryptedFile(path, key);
    try {
      assertEqual(rowsOf(reopened, "select count(*) as n from t"), [{ n: 0 }]);
    } finally {
      reopened.close();
    }
  });

  test("isFileOpen tells whether a connection of the process holds a file, by any spelling of its path", () => {
    const path = pathOf("is-open.db");

    assertEqual(binding.isFileOpen(path), false);
    assertEqual(binding.isFileOpen(pathOf("missing-directory/x.db")), false);
    const database = binding.openFile(path);
    assertEqual(binding.isFileOpen(path), true);
    assertEqual(binding.isFileOpen(`${directory}/./is-open.db`), true);
    database.close();
    assertEqual(binding.isFileOpen(path), false);
    // A file in a "directory" that is a file doesn't exist either.
    assertEqual(binding.isFileOpen(`${path}/x.db`), false);
  });

  test("deleteFile removes the database and then its -journal, -wal and -shm, refuses a held file, and finds missing files fine (G11)", () => {
    const path = pathOf("deleted.db");
    const holder = binding.openFile(path);
    run(holder, "create table t (a)");
    // Databases at the sidecars' paths stand in for them, created after the
    // holder last read the database, which would have rolled back a journal.
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      const database = binding.openFile(`${path}${suffix}`);
      run(database, "create table t (a)");
      database.close();
    }

    assertEqual(
      thrownBy(() => {
        binding.deleteFile(path);
      }),
      heldError,
    );
    holder.close();
    assertEqual(binding.deleteFile(path), undefined);

    for (const suffix of ["-journal", "-wal", "-shm", ""]) {
      const database = binding.openFile(`${path}${suffix}`);
      try {
        assertEqual(
          rowsOf(database, "select count(*) as n from sqlite_schema"),
          [{ n: 0 }],
        );
      } finally {
        database.close();
      }
    }
    binding.deleteFile(path);
    binding.deleteFile(path);
    binding.deleteFile(pathOf("missing-directory/deleted.db"));
  });

  test("deleteFile fails with SQLITE_IOERR_DELETE and errno for a file it can't remove", () => {
    // A directory at the database's path, which unlink refuses.
    const path = pathOf("directory.db");
    binding.openFile(`${path}/inner.db`).close();

    const thrown = thrownBy(() => {
      binding.deleteFile(path);
    }) as { readonly cause: { readonly systemErrno: number } };

    // EPERM on Apple's platforms, EISDIR on Linux.
    assertEqual(thrown.cause.systemErrno > 0, true);
    assertEqual(
      thrown,
      sqliteError({
        operation: "deleteFile",
        extendedCode: 2570,
        message: "disk I/O error",
        systemErrno: thrown.cause.systemErrno,
      }),
    );
  });

  test("openFile fails with SQLITE_CANTOPEN and errno for a directory that is a file", () => {
    const file = pathOf("not-a-directory.db");
    binding.openFile(file).close();

    assertEqual(
      thrownBy(() => binding.openFile(`${file}/x.db`)),
      sqliteError({
        operation: "open",
        extendedCode: 14,
        message: "unable to open database file",
        // ENOTDIR on Apple's platforms, Linux and Android.
        systemErrno: 20,
      }),
    );
  });

  test("each path function throws a TypeError for a path that contains a NUL character, isn't absolute or doesn't end in a file name", () => {
    const pathFunctions: ReadonlyArray<(path: string) => unknown> = [
      binding.openFile,
      (path) => binding.openEncryptedFile(path, key),
      binding.isFileOpen,
      binding.deleteFile,
    ];
    for (const pathFunction of pathFunctions)
      for (const [path, message] of [
        [`${pathOf("nul")}\0.db`, "The path contains a NUL character."],
        ["relative.db", "The path isn't absolute."],
        ["", "The path isn't absolute."],
        [`${directory}/`, "The path doesn't end in a file name."],
        [`${directory}/..`, "The path doesn't end in a file name."],
        [`${directory}/.`, "The path doesn't end in a file name."],
      ])
        assertEqual(
          thrownBy(() => pathFunction(path)),
          typeError(message),
        );
    for (const pathFunction of pathFunctions)
      assertEqual(
        thrownBy(() => pathFunction(1 as never)),
        typeError("The path must be a string."),
      );
  });

  test("prepare refuses SQL without a statement", () => {
    const database = binding.openMemory();
    try {
      for (const sql of ["", " \n", ";", "-- comment", "/* comment */", "﻿"])
        assertEqual(
          thrownBy(() => database.prepare(sql)),
          errorWith("The SQL contains no statement.", {
            type: "SqliteEmptySqlError",
          }),
        );
    } finally {
      database.close();
    }
  });

  test("prepare refuses a second statement after semicolons, whitespace, comments and byte order marks, and never runs it", () => {
    const database = binding.openMemory();
    try {
      for (const sql of [
        "select 1; select 2",
        "select 1; -- comment\nselect 2",
        "select 1; /* comment */ select 2",
        "select 1;﻿ select 2",
        "select 1; pragma foreign_keys = 1",
      ])
        assertEqual(
          thrownBy(() => database.prepare(sql)),
          errorWith("The SQL contains more than one statement.", {
            type: "SqliteMultipleStatementsError",
          }),
        );

      assertEqual(rowsOf(database, "pragma foreign_keys"), [
        { foreign_keys: 0 },
      ]);
      assertEqual(
        rowsOf(database, "select 1 as a;;﻿ -- comment\n/* comment */;"),
        [{ a: 1 }],
      );
    } finally {
      database.close();
    }
  });

  test("prepare refuses SQL with a NUL character or a lone surrogate before SQLite sees it", () => {
    const database = binding.openMemory();
    try {
      assertEqual(
        thrownBy(() => database.prepare("pragma foreign_keys = 1\0select 1")),
        errorWith("The SQL contains a NUL character.", {
          type: "SqliteInvalidSqlText",
        }),
      );
      for (const sql of [
        "select '\uD800'",
        'select 1 as "\uDC00"',
        "select '\uD800'",
        "select 1 -- \uD800",
        "select '\uDBFF'",
        'select 1 as "\uDFFF"',
      ])
        assertEqual(
          thrownBy(() => database.prepare(sql)),
          errorWith("The SQL contains a lone surrogate.", {
            type: "SqliteInvalidSqlText",
          }),
        );

      assertEqual(rowsOf(database, "pragma foreign_keys"), [
        { foreign_keys: 0 },
      ]);
      assertEqual(rowsOf(database, "select '😀' as a"), [{ a: "😀" }]);
      assertEqual(
        rowsOf(database, "select '\u{10000}' as a, '\u{10FFFF}' as b"),
        [{ a: "\u{10000}", b: "\u{10FFFF}" }],
      );
      assertEqual(
        thrownBy(() => database.prepare(1 as never)),
        typeError("The SQL must be a string."),
      );
    } finally {
      database.close();
    }
  });

  test("prepare refuses a keying pragma on every file, plain SQLite's with SQLITE_AUTH and the codec's with its failure, so no file is keyed through SQL", () => {
    const keyingSql = [
      "pragma key = 'x'",
      "pragma rekey = 'x'",
      "pragma hexkey = '00'",
    ];
    const plain = binding.openFile(pathOf("keying-plain.db"));
    const encrypted = binding.openEncryptedFile(
      pathOf("keying-encrypted.db"),
      key,
    );
    try {
      for (const sql of keyingSql) {
        assertEqual(
          thrownBy(() => plain.prepare(sql)),
          sqliteError({
            operation: "prepare",
            extendedCode: 23,
            message: "not authorized",
          }),
        );
        assertEqual(
          thrownBy(() => encrypted.prepare(sql)),
          sqliteError({
            operation: "prepare",
            extendedCode: 1,
            message:
              "Databases are keyed only through evolu_codec_open, never through SQL.",
            cause: {
              type: "SqliteCodecFailure",
              error: { type: "SqliteEncryptionUnsupported" },
            },
          }),
        );
      }
    } finally {
      plain.close();
      encrypted.close();
    }
  });

  test("prepare throws SQLite's error with the byte offset in the UTF-8 SQL of a parser error", () => {
    const database = binding.openMemory();
    try {
      // "kůň" takes 7 bytes but 5 UTF-16 code units.
      assertEqual(
        thrownBy(() => database.prepare("select 'kůň', nope")),
        sqliteError({
          operation: "prepare",
          extendedCode: 1,
          message: "no such column: nope",
          sqlOffset: 16,
        }),
      );
    } finally {
      database.close();
    }
  });

  test("run binds null, safe integers, other finite numbers, text and blobs, and reads each by its type", () => {
    const database = binding.openMemory();
    try {
      const echo = database.prepare("select ?1 as value, typeof(?1) as type");
      const cases: ReadonlyArray<readonly [TestValue, unknown, string]> = [
        [null, null, "null"],
        [0, 0, "integer"],
        [-7, -7, "integer"],
        [2 ** 53 - 1, 2 ** 53 - 1, "integer"],
        [-(2 ** 53 - 1), -(2 ** 53 - 1), "integer"],
        [2 ** 53, 2 ** 53, "real"],
        [1.5, 1.5, "real"],
        [-1e300, -1e300, "real"],
        ["", "", "text"],
        ["a\0b", "a\0b", "text"],
        ["ř😀", "ř😀", "text"],
        ["a\uD800b", "a�b", "text"],
        [new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]), "blob"],
        [new Uint8Array(0), new Uint8Array(0), "blob"],
        [
          new Uint8Array([9, 1, 2, 9]).subarray(1, 3),
          new Uint8Array([1, 2]),
          "blob",
        ],
      ];
      for (const [value, expected, type] of cases)
        assertEqual(echo.run(values(value)), [{ value: expected, type }]);
      echo.finalize();

      // INTEGER reads as a double, so integers beyond 2^53 round.
      assertEqual(
        rowsOf(
          database,
          "select 9007199254740993 as a, 9223372036854775807 as b",
        ),
        [{ a: 2 ** 53, b: 2 ** 63 }],
      );
      const [row] = rowsOf(database, "select x'0102' as blob") as Array<{
        readonly blob: Uint8Array;
      }>;
      // A copy with its own buffer.
      assertEqual([row.blob.byteOffset, row.blob.buffer.byteLength], [0, 2]);
    } finally {
      database.close();
    }
  });

  test("TEXT that isn't UTF-8 reads with U+FFFD in place of each ill-formed sequence, as the WHATWG decoder reads it", () => {
    const database = binding.openMemory();
    try {
      const textOf = database.prepare("select cast(? as text) as text");
      // The bytes, and what they read as.
      for (const [hex, text] of [
        ["61", "a"],
        ["7f", "\u007F"],
        ["c280", "\u0080"],
        ["dfbf", "߿"],
        ["c3a9", "é"],
        ["e282ac", "€"],
        ["e0a080", "ࠀ"],
        ["ed9fbf", "퟿"],
        ["f0908080", "\u{10000}"],
        ["f1808080", "\u{40000}"],
        ["f48fbfbf", "\u{10FFFF}"],
        // A continuation byte, and leads no UTF-8 sequence starts with.
        ["80", "�"],
        ["c0af", "��"],
        ["c1bf", "��"],
        ["f5808080", "����"],
        ["ff61", "�a"],
        // Overlong, surrogate and out-of-range sequences, which fail at their
        // second byte.
        ["e08080", "���"],
        ["eda080", "���"],
        ["f0808080", "����"],
        ["e09f80", "���"],
        ["f08f8080", "����"],
        ["f4908080", "����"],
        // A byte just outside a continuation byte's range, first and later.
        ["c37f", "�\u007F"],
        ["c3c0", "��"],
        ["e2827f", "�\u007F"],
        ["e282c0", "��"],
        // A sequence cut short by another byte, or by the end.
        ["c328", "�("],
        ["e28228", "�("],
        ["f09f9828", "�("],
        ["61e282", "a�"],
        ["f09f98", "�"],
      ]) {
        const blob = Uint8Array.from(hex.match(/../gu) ?? [], (byte) =>
          Number.parseInt(byte, 16),
        );
        assertEqual([hex, textOf.run([blob])], [hex, [{ text }]]);
      }
      textOf.finalize();
    } finally {
      database.close();
    }
  });

  test("column names and error messages that aren't UTF-8 read with U+FFFD in place of each ill-formed sequence", () => {
    const database = binding.openFile(illFormedNames);
    try {
      assertEqual(rowsOf(database, "select * from t"), [
        { "a\uFFFDb": 1, "a\uFFFDc": 2 },
      ]);
      assertEqual(
        thrownBy(() => run(database, "insert into t values (-1, 0)")),
        sqliteError({
          operation: "step",
          extendedCode: 275,
          message: "CHECK constraint failed: c\uFFFDd",
        }),
      );
    } finally {
      database.close();
    }
  });

  test("memory, plain and encrypted databases are defensive, so SQL can't write their schema, even with writable_schema on, which they ignore", () => {
    for (const database of [
      binding.openMemory(),
      binding.openFile(pathOf("defensive-plain.db")),
      binding.openEncryptedFile(pathOf("defensive-encrypted.db"), key),
    ])
      try {
        run(database, "create table t (a)");
        run(database, "pragma writable_schema = on");
        assertEqual(
          thrownBy(() =>
            run(
              database,
              "update sqlite_schema set sql = 'create table t (b)' where name = 't'",
            ),
          ),
          sqliteError({
            operation: "prepare",
            extendedCode: 1,
            message: "table sqlite_master may not be modified",
          }),
        );
      } finally {
        database.close();
      }
  });

  test("bind and run throw a TypeError for any other value", () => {
    const database = binding.openMemory();
    try {
      const statement = database.prepare("select ? as value");
      for (const value of [
        undefined,
        true,
        1n,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        {},
        [1],
        new Uint16Array(1),
        new ArrayBuffer(1),
      ]) {
        const valueError = typeError(
          "A parameter must be null, a finite number, a string or a Uint8Array.",
        );
        assertEqual(
          thrownBy(() => statement.run([value as never])),
          valueError,
        );
        assertEqual(
          thrownBy(() => {
            statement.bind([value as never]);
          }),
          valueError,
        );
      }
      for (const parameters of [undefined, "x", 1, {}, { length: 1, 0: 1 }])
        assertEqual(
          thrownBy(() => statement.run(parameters as never)),
          typeError("The parameters must be an array."),
        );
      assertEqual(statement.run(values(1)), [{ value: 1 }]);

      // An array whose getter shrinks it while it's read reads undefined.
      const two = database.prepare("select ? as a, ? as b");
      const shrunk = () => {
        const parameters = [...values(0, 0)];
        Object.defineProperty(parameters, 0, {
          get: () => {
            parameters.length = 1;
            return 0;
          },
        });
        return parameters;
      };
      const valueError = typeError(
        "A parameter must be null, a finite number, a string or a Uint8Array.",
      );
      assertEqual(
        thrownBy(() => two.run(shrunk())),
        valueError,
      );
      assertEqual(
        thrownBy(() => {
          two.bind(shrunk());
        }),
        valueError,
      );
    } finally {
      database.close();
    }
  });

  // Ordinary [[Set]] semantics for the setters below, which define the element
  // they intercept.
  const defineElement = (
    array: Array<unknown>,
    index: string,
    value: unknown,
  ) => {
    Object.defineProperty(array, index, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  };

  test("run and bind read each parameter as an ordinary get, so an index getter of Array.prototype answers for an element a getter removed", () => {
    const database = binding.openMemory();
    const statement = database.prepare("select ? as a, ? as b");
    const shrunk = () => {
      const parameters = [...values(0, 0)];
      Object.defineProperty(parameters, 0, {
        get: () => {
          parameters.length = 1;
          return 0;
        },
      });
      return parameters;
    };
    let ran: unknown = null;
    let stepped: unknown = null;
    // oxlint-disable-next-line eslint/no-extend-native -- A removed element must read through the prototype.
    Object.defineProperty(Array.prototype, "1", {
      configurable: true,
      get: () => 5,
      set(this: Array<unknown>, value: unknown) {
        defineElement(this, "1", value);
      },
    });
    try {
      ran = statement.run(shrunk());
      statement.bind(shrunk());
      stepped = statement.step();
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)["1"];
      database.close();
    }

    assertEqual([ran, stepped], [[{ a: 0, b: 5 }], { a: 0, b: 5 }]);
  });

  test("run appends each row as an ordinary set, so an index setter of Array.prototype that shrinks the rows leaves every row", () => {
    const database = binding.openMemory();
    const statement = database.prepare(
      "select 1 as a union all select 2 union all select 3",
    );
    let rows: unknown = null;
    // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
      set(this: Array<unknown>, value: unknown) {
        defineElement(this, "0", value);
        this.length = 1;
      },
    });
    try {
      rows = statement.run([]);
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      database.close();
    }

    assertEqual(rows, [{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  test("a run or database run of a result larger than a few values returns every row when its rows array's index setter runs another statement of such a result", () => {
    const database = binding.openMemory();
    // More values than a call passes as its arguments in Node-API, which
    // reuses the buffer of the others for its next call.
    const count = nodeArgumentValues + 100;
    const sql = (sign: string) =>
      `with r(n) as (select 1 union all select n + 1 from r where n < ${count}) select ${sign}n as n, 'kůň ' || n as t from r`;
    const statement = database.prepare(sql(""));
    const runs = [() => statement.run([]), () => database.run(sql(""), [])];
    const results: Array<unknown> = [];
    try {
      for (const call of runs) {
        let isRunning = false;
        // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
        Object.defineProperty(Array.prototype, "0", {
          configurable: true,
          // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
          set(this: Array<unknown>, value: unknown) {
            defineElement(this, "0", value);
            if (isRunning) return;
            isRunning = true;
            database.run(sql("-"), []);
          },
        });
        try {
          results.push(call());
        } finally {
          delete (Array.prototype as unknown as Record<string, unknown>)["0"];
        }
      }
      statement.finalize();
    } finally {
      database.close();
    }

    const rows = Array.from({ length: count }, (_, i) => ({
      n: i + 1,
      t: `kůň ${i + 1}`,
    }));
    assertEqual(results, [rows, rows]);
  });

  test("a run whose rows array's index setter steps the same statement leaves it reset, so the next run returns every row, of numbers or of texts", () => {
    const database = binding.openMemory();
    try {
      // Node-API builds the rows of a few numbers after its native returns,
      // and those of several texts in a call before.
      for (const [sql, rows] of [
        [
          "select 1 as a union all select 2 union all select 3",
          [{ a: 1 }, { a: 2 }, { a: 3 }],
        ],
        [
          "select 'x' as a union all select 'y' union all select 'z'",
          [{ a: "x" }, { a: "y" }, { a: "z" }],
        ],
      ] as const) {
        const statement = database.prepare(sql);
        let hook: (() => void) | null = () => {
          statement.step();
        };
        // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
        Object.defineProperty(Array.prototype, "0", {
          configurable: true,
          // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
          set(this: Array<unknown>, value: unknown) {
            const run = hook;
            hook = null;
            run?.();
            defineElement(this, "0", value);
          },
        });
        try {
          statement.run([]);
        } finally {
          delete (Array.prototype as unknown as Record<string, unknown>)["0"];
        }

        assertEqual(statement.run([]), rows);
      }
    } finally {
      database.close();
    }
  });

  test("a run whose rows array's index setter steps or finalizes the statement and throws throws its error and leaves the statement reset or finalized, of numbers or of texts", () => {
    for (const [sql, first] of [
      ["select 1 as a union all select 2 union all select 3", { a: 1 }],
      ["select 'x' as a union all select 'y' union all select 'z'", { a: "x" }],
    ] as const)
      for (const target of ["step", "finalize"] as const) {
        const database = binding.openMemory();
        try {
          const statement = database.prepare(sql);
          let hook: (() => void) | null = () => {
            if (target === "step") statement.step();
            else statement.finalize();
            throw new Error("The setter threw.");
          };
          // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
          Object.defineProperty(Array.prototype, "0", {
            configurable: true,
            // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
            set(this: Array<unknown>, value: unknown) {
              const run = hook;
              hook = null;
              run?.();
              defineElement(this, "0", value);
            },
          });
          let thrown: unknown = null;
          try {
            thrown = thrownBy(() => statement.run([]));
          } finally {
            delete (Array.prototype as unknown as Record<string, unknown>)["0"];
          }

          assertEqual(thrown, errorWith("The setter threw.", undefined));
          assertEqual(
            target === "step"
              ? statement.step()
              : thrownBy(() => statement.step()),
            target === "step"
              ? first
              : errorWith("The statement is finalized.", undefined),
          );
        } finally {
          database.close();
        }
      }
  });

  test("a run of a write that returns rows returns them and its changes when a setter of Object.prototype for rows or changes closes the database", () => {
    for (const key of ["rows", "changes"] as const) {
      const database = binding.openMemory();
      try {
        run(database, "create table t (a)");
        const statement = database.prepare(
          "insert into t values (1) returning a",
        );
        let hook: (() => void) | null = () => {
          database.close();
        };
        // oxlint-disable-next-line eslint/no-extend-native -- A result's property must run JavaScript where an adapter sets it.
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
          set(this: object, value: unknown) {
            const close = hook;
            hook = null;
            close?.();
            Object.defineProperty(this, key, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });
        let result: unknown = null;
        try {
          result = statement.run([]);
        } finally {
          delete (Object.prototype as Record<string, unknown>)[key];
        }

        assertEqual(result, { rows: [{ a: 1 }], changes: 1 });
      } finally {
        database.close();
      }
    }
  });

  test("a run, bind or database run refuses an array of more parameters than its statement has before it reads an element", () => {
    const database = binding.openMemory();
    try {
      // More than SQLite's limit of a statement's parameters.
      const parameters: Array<unknown> = [];
      parameters.length = 1_000_000;
      Object.defineProperty(parameters, 0, {
        get: () => {
          throw new Error("An element was read.");
        },
      });
      const statement = database.prepare("select ? as a");
      const refused = typeError("Expected 1 parameters, got 1000000.");

      assertEqual(
        [
          thrownBy(() => statement.run(parameters as never)),
          thrownBy(() => statement.bind(parameters as never)),
          thrownBy(() => database.run("select ? as a", parameters as never)),
        ],
        [refused, refused, refused],
      );
      statement.finalize();
    } finally {
      database.close();
    }
  });

  test("a database run reads an array as long as SQLite's limit of a statement's parameters, 32,766, and refuses a longer one before it reads an element", () => {
    const database = binding.openMemory();
    try {
      const runOf = (length: number) => {
        const parameters: Array<unknown> = [];
        parameters.length = length;
        let isRead = false;
        Object.defineProperty(parameters, 0, {
          get: () => {
            isRead = true;
            return 1;
          },
        });
        const thrown = thrownBy(() =>
          database.run("select ? as a", parameters as never),
        );
        return [isRead, thrown];
      };

      assertEqual(
        [runOf(32_766), runOf(32_767)],
        [
          [true, typeError("Expected 1 parameters, got 32766.")],
          [false, typeError("Expected 1 parameters, got 32767.")],
        ],
      );
    } finally {
      database.close();
    }
  });

  test("run, bind and database run bind more parameters than Node-API reads into memory of its own", () => {
    const database = binding.openMemory();
    try {
      for (const count of [17, 100]) {
        const sql = `select ${Array.from({ length: count }, (_, i) => `?${i + 1}`).join(" + ")} as n`;
        const parameters = values(
          ...Array.from({ length: count }, (_, i) => i + 1),
        );
        const n = (count * (count + 1)) / 2;
        const statement = database.prepare(sql);
        const ran = statement.run(parameters);
        statement.bind(parameters);
        const stepped = statement.step();
        statement.finalize();

        assertEqual(
          [ran, stepped, database.run(sql, parameters)],
          [[{ n }], { n }, [{ n }]],
        );
      }
    } finally {
      database.close();
    }
  });

  test("a run or bind whose parameter's getter finalizes the statement or closes its database throws before it binds", () => {
    const database = binding.openMemory();
    const other = binding.openMemory();
    try {
      const finalizing = database.prepare("select ? as a");
      const finalizes = [...values(0)];
      Object.defineProperty(finalizes, 0, {
        get: () => {
          finalizing.finalize();
          return 1;
        },
      });
      const closing = database.prepare("select ? as a");
      const closes = [...values(0)];
      Object.defineProperty(closes, 0, {
        get: () => {
          database.close();
          return 1;
        },
      });
      const closingRun = other.prepare("select ? as a");
      const closesOther = [...values(0)];
      Object.defineProperty(closesOther, 0, {
        get: () => {
          other.close();
          return 1;
        },
      });
      const finalized = {
        kind: "Error",
        message: "The statement is finalized.",
        cause: undefined,
      };

      assertEqual(
        thrownBy(() => finalizing.run(finalizes)),
        finalized,
      );
      assertEqual(
        thrownBy(() => {
          closing.bind(closes);
        }),
        finalized,
      );
      assertEqual(
        thrownBy(() => closingRun.run(closesOther)),
        finalized,
      );
      assertEqual(
        thrownBy(() => database.prepare("select 1")),
        {
          kind: "Error",
          message: "The database is closed.",
          cause: undefined,
        },
      );
    } finally {
      database.close();
      other.close();
    }
  });

  test("run, bind and database run take a Proxy of an array as their parameters where the adapter sees an array, and refuse it with a TypeError where it doesn't", () => {
    const database = binding.openMemory();
    try {
      const statement = database.prepare("select ? as a");
      const proxy = () =>
        new Proxy([1], {}) as unknown as ReadonlyArray<SqliteValue>;
      const calls = [
        () => statement.run(proxy()),
        () => {
          statement.bind(proxy());
          const row = statement.step();
          statement.reset();
          return row;
        },
        () => database.run("select ? as a", proxy()),
      ];

      assertEqual(
        calls.map((call) => (acceptsProxyArrays ? call() : thrownBy(call))),
        acceptsProxyArrays
          ? [[{ a: 1 }], { a: 1 }, [{ a: 1 }]]
          : calls.map(() => typeError("The parameters must be an array.")),
      );
    } finally {
      database.close();
    }
  });

  test("a run or bind with a different number of parameters than the SQL has throws a TypeError", () => {
    const database = binding.openMemory();
    try {
      const two = database.prepare("select ? as a, ? as b");
      for (const parameters of [[], [1], [1, 2, 3]])
        assertEqual(
          thrownBy(() => two.run(values(...parameters))),
          typeError(`Expected 2 parameters, got ${parameters.length}.`),
        );
      assertEqual(
        thrownBy(() => {
          two.bind(values(1));
        }),
        typeError("Expected 2 parameters, got 1."),
      );
      assertEqual(two.run(values(1, 2)), [{ a: 1, b: 2 }]);

      // A numbered parameter counts up to its number, and named ones are
      // positional.
      assertEqual(run(database, "select ?3 as c", [1, 2, 3]).rows, [{ c: 3 }]);
      assertEqual(run(database, "select :a as a, @b as b", ["x", "y"]).rows, [
        { a: "x", b: "y" },
      ]);
      assertEqual(
        thrownBy(() => run(database, "select 1", [1])),
        typeError("Expected 0 parameters, got 1."),
      );
    } finally {
      database.close();
    }
  });

  test("rows inherit nothing, and the last of columns with the same name wins", () => {
    const database = binding.openMemory();
    try {
      const [row] = rowsOf(
        database,
        'select 1 as a, 2 as a, 3 as "__proto__", 4 as constructor',
      );

      assertEqual(inheritsNothing(row), true);
      assertEqual(Object.entries(row), [
        ["a", 2],
        ["__proto__", 3],
        ["constructor", 4],
      ]);
    } finally {
      database.close();
    }
  });

  test("column aliases keep accented, CJK and emoji characters", () => {
    const database = binding.openMemory();
    try {
      const [row] = rowsOf(
        database,
        'select 1 as "é", 2 as "é", 3 as "日本語", 4 as "😀"',
      );

      assertEqual(Object.keys(row), ["é", "é", "日本語", "😀"]);
    } finally {
      database.close();
    }
  });

  test("a statement reads its column names again after a schema change", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (a)");
      run(database, "insert into t values (1)");
      const select = database.prepare("select * from t");
      assertEqual(select.run([]), [{ a: 1 }]);

      run(database, "alter table t add column b default 2");

      assertEqual(select.run([]), [{ a: 1, b: 2 }]);
      select.bind([]);
      assertEqual(select.step(), { a: 1, b: 2 });
      select.finalize();
    } finally {
      database.close();
    }
  });

  test("run returns the rows and changes and resets, also after an error, so the statement runs again", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (a primary key)");
      const insert = database.prepare("insert into t values (?) returning a");

      assertEqual(insert.run(values(1)), { rows: [{ a: 1 }], changes: 1 });
      assertEqual(
        thrownBy(() => insert.run(values(1))),
        sqliteError({
          operation: "step",
          extendedCode: 1555,
          message: "UNIQUE constraint failed: t.a",
        }),
      );
      assertEqual(insert.run(values(2)), { rows: [{ a: 2 }], changes: 1 });
      assertEqual(rowsOf(database, "select a from t order by a"), [
        { a: 1 },
        { a: 2 },
      ]);
    } finally {
      database.close();
    }
  });

  test("run clears its bindings after a text or blob over 64 KiB, also when it fails, so a kept statement holds no copy of it", () => {
    const database = binding.openMemory();
    try {
      const select = database.prepare("select length(?) as n");
      const runThenStep = (value: TestValue) => {
        select.run(values(value));
        const row = select.step();
        select.reset();
        return row;
      };
      assertEqual(runThenStep(new Uint8Array(8 * 1024 * 1024)), { n: null });
      assertEqual(runThenStep("a".repeat(8 * 1024 * 1024)), { n: null });
      // Up to 64 KiB, of UTF-8 for text, the bindings stay.
      assertEqual(runThenStep(new Uint8Array(65_536)), { n: 65_536 });
      assertEqual(runThenStep(new Uint8Array(65_537)), { n: null });
      assertEqual(runThenStep("é".repeat(32_768)), { n: 32_768 });
      assertEqual(runThenStep(`${"é".repeat(32_768)}a`), { n: null });
      select.finalize();

      const failing = database.prepare("select length(?) as n, json(?) as j");
      const large = new Uint8Array(8 * 1024 * 1024);
      assertEqual(
        thrownBy(() => failing.run([large, undefined as never])),
        typeError(
          "A parameter must be null, a finite number, a string or a Uint8Array.",
        ),
      );
      assertEqual(failing.step(), { n: null, j: null });
      failing.reset();
      assertEqual(
        thrownBy(() => failing.run(values(large, "{"))),
        sqliteError({
          operation: "step",
          extendedCode: 1,
          message: "malformed JSON",
        }),
      );
      assertEqual(failing.step(), { n: null, j: null });
      failing.reset();
      // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
        set() {
          throw new Error("append");
        },
      });
      let appendError: unknown = null;
      try {
        appendError = thrownBy(() => failing.run(values(large, "1")));
      } finally {
        delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      }
      assertEqual(appendError, errorWith("append", undefined));
      assertEqual(failing.step(), { n: null, j: null });
      failing.finalize();
    } finally {
      database.close();
    }
  });

  test("step returns each row and then null, never resets, and reset keeps the bindings", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (a)");
      run(database, "insert into t values (1), (2), (3)");
      const select = database.prepare("select a from t where a > ? order by a");

      select.bind(values(1));
      assertEqual(select.step(), { a: 2 });
      select.reset();
      assertEqual(select.step(), { a: 2 });
      assertEqual(select.step(), { a: 3 });
      assertEqual(select.step(), null);
      select.reset();
      assertEqual(select.step(), { a: 2 });
      select.finalize();

      // Also over 64 KiB, which only run clears.
      const large = database.prepare("select length(?) as n");
      large.bind(values(new Uint8Array(8 * 1024 * 1024)));
      assertEqual(large.step(), { n: 8_388_608 });
      large.reset();
      assertEqual(large.step(), { n: 8_388_608 });
      large.finalize();
    } finally {
      database.close();
    }
  });

  test("reset and finalize throw the error of completing a statement whose last step returned a row, and ignore a code that only repeats a failed step's", () => {
    const database = binding.openMemory();
    try {
      run(database, "pragma foreign_keys = 1");
      run(database, "create table p (id integer primary key)");
      run(
        database,
        "create table c (p integer references p deferrable initially deferred)",
      );
      // The deferred check fails when the statement's transaction commits,
      // which completing it after its row does.
      const commitError = sqliteError({
        operation: "step",
        extendedCode: 787,
        message: "FOREIGN KEY constraint failed",
      });
      const insert = "insert into c values (?) returning p";

      const reset = database.prepare(insert);
      reset.bind(values(1));
      assertEqual(reset.step(), { p: 1 });
      assertEqual(
        thrownBy(() => {
          reset.reset();
        }),
        commitError,
      );
      reset.finalize();

      const finalize = database.prepare(insert);
      finalize.bind(values(1));
      assertEqual(finalize.step(), { p: 1 });
      assertEqual(
        thrownBy(() => {
          finalize.finalize();
        }),
        commitError,
      );

      // After SQLITE_DONE, the code is SQLITE_OK.
      const done = database.prepare("select 1 as a");
      done.bind([]);
      assertEqual(done.step(), { a: 1 });
      assertEqual(done.step(), null);
      done.reset();
      done.finalize();

      // After a failed step, the code repeats the step's error.
      const failed = database.prepare("insert into p values (?)");
      run(database, "insert into p values (1)");
      const uniqueError = sqliteError({
        operation: "step",
        extendedCode: 1555,
        message: "UNIQUE constraint failed: p.id",
      });
      failed.bind(values(1));
      assertEqual(
        thrownBy(() => failed.step()),
        uniqueError,
      );
      failed.reset();
      assertEqual(
        thrownBy(() => failed.step()),
        uniqueError,
      );
      failed.finalize();

      // Also after a step that failed after a row: abs() of the smallest
      // integer overflows, which only the second row computes.
      for (const resets of [true, false]) {
        const failing = database.prepare(
          "select value from (select 1 as value union all select 2) where abs(-9223372036854775807 - (value = 2)) > 0",
        );
        failing.bind([]);
        assertEqual(failing.step(), { value: 1 });
        assertEqual(
          thrownBy(() => failing.step()),
          sqliteError({
            operation: "step",
            extendedCode: 1,
            message: "integer overflow",
          }),
        );
        if (resets) failing.reset();
        failing.finalize();
      }

      assertEqual(rowsOf(database, "select count(*) as n from c"), [{ n: 0 }]);
    } finally {
      database.close();
    }
  });

  test("changes counts only the rows a write changed, and is 0 after a query, a schema change, a read-only statement and a write that changed no rows", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (a)");

      assertEqual(
        run(database, "insert into t values (1), (2), (3)").changes,
        3,
      );
      assertEqual(run(database, "select * from t").changes, 0);
      assertEqual(run(database, "create table u (a)").changes, 0);
      assertEqual(run(database, "pragma user_version").changes, 0);
      assertEqual(run(database, "update t set a = a where 0").changes, 0);
      assertEqual(
        run(database, "update t set a = a + 1 where a > 1").changes,
        2,
      );
      assertEqual(run(database, "delete from t").changes, 3);
    } finally {
      database.close();
    }
  });

  test("run returns its changes when it returned no row, its rows when it changed none, and both when it did both", () => {
    const database = binding.openMemory();
    try {
      const runOf = (sql: string) => {
        const statement = database.prepare(sql);
        try {
          return statement.run([]);
        } finally {
          statement.finalize();
        }
      };

      assertEqual(runOf("create table t (a primary key)"), 0);
      assertEqual(runOf("insert into t values (1), (2)"), 2);
      assertEqual(runOf("select a from t order by a"), [{ a: 1 }, { a: 2 }]);
      assertEqual(runOf("select a from t where a > 2"), 0);
      assertEqual(runOf("insert into t values (3) returning a"), {
        rows: [{ a: 3 }],
        changes: 1,
      });
      assertEqual(
        runOf("insert into t values (3) on conflict do nothing returning a"),
        0,
      );
    } finally {
      database.close();
    }
  });

  test("run, step and database run return every row and column of a result larger than a few values", () => {
    const database = binding.openMemory();
    try {
      // More columns than a call passes as its arguments in Node-API.
      const width = nodeArgumentValues + 4;
      const columns = Array.from({ length: width }, (_, i) => `${i} as c${i}`);
      const wide = Object.fromEntries(
        Array.from({ length: width }, (_, i) => [`c${i}`, i]),
      );
      const select = database.prepare(`select ${columns.join(", ")}`);
      assertEqual(select.run([]), [wide]);
      select.bind([]);
      assertEqual(select.step(), wide);
      select.finalize();
      // Rows of one column, more than a call passes as its arguments.
      const many = `with r(n) as (select 1 union all select n + 1 from r where n < ${width}) select n from r`;
      const rows = Array.from({ length: width }, (_, i) => ({ n: i + 1 }));
      assertEqual(database.run(many, []), rows);
      const statement = database.prepare(many);
      assertEqual(statement.run([]), rows);
      statement.finalize();
    } finally {
      database.close();
    }
  });

  test("run, step and database run return every value of a result of as many values as a call passes as its arguments in Node-API, or one or two more, rows of one column or one row", () => {
    const database = binding.openMemory();
    try {
      for (const count of [
        nodeArgumentValues,
        nodeArgumentValues + 1,
        nodeArgumentValues + 2,
      ]) {
        const numbers = Array.from({ length: count }, (_, i) => i + 1);
        const tall = `with r(n) as (select 1 union all select n + 1 from r where n < ${count}) select n from r`;
        const wide = `select ${numbers.map((n) => `${n} as c${n}`).join(", ")}`;
        // Texts and blobs, more than the one that a result in the shared
        // memory holds, so Node-API passes them all to the row builder.
        const tallTexts = `with r(n) as (select 1 union all select n + 1 from r where n < ${count}) select 'a longer ascii text ' || n as t from r`;
        const wideBlobs = `select ${numbers.map((n) => `x'${n.toString(16).padStart(4, "0")}' as c${n}`).join(", ")}`;
        for (const [sql, rows] of [
          [tall, numbers.map((n) => ({ n }))],
          [wide, [Object.fromEntries(numbers.map((n) => [`c${n}`, n]))]],
          [tallTexts, numbers.map((n) => ({ t: `a longer ascii text ${n}` }))],
          [
            wideBlobs,
            [
              Object.fromEntries(
                numbers.map((n) => [
                  `c${n}`,
                  new Uint8Array([n >> 8, n & 0xff]),
                ]),
              ),
            ],
          ],
        ] as const) {
          const statement = database.prepare(sql);
          const ran = statement.run([]);
          const stepped: Array<unknown> = [];
          for (let row = statement.step(); row !== null; row = statement.step())
            stepped.push(row);
          statement.finalize();

          assertEqual(
            [ran, stepped, database.run(sql, [])],
            [rows, rows, rows],
          );
        }
      }
    } finally {
      database.close();
    }
  });

  test("a result larger than a few values reads each value as a row of its own does: NULL, numbers, empty, NUL, BOM, non-ASCII and ill-formed text, and blobs, each with a buffer of its own", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (id integer primary key, a, b)");
      // A text that starts with a byte order mark comes first, so no decoder
      // takes it for the mark of a stream.
      const cases: ReadonlyArray<readonly [string, ReadonlyArray<TestValue>]> =
        [
          ["?, ?", ["\uFEFFfirst", null]],
          ["?, ?", [1, 2.5]],
          ["?, ?", ["", new Uint8Array()]],
          ["?, ?", ["a\0b", "kůň 😀 日本語"]],
          ["?, ?", [new Uint8Array([1, 2, 3]), new Uint8Array(70_000).fill(7)]],
          ["cast(x'61ff62' as text), cast(x'e282' as text)", []],
          ["cast(x'f09f98' as text), ?", ["ok"]],
          ["?, ?", [-0, Number.MAX_SAFE_INTEGER]],
          ["?, ?", ["x".repeat(200), "é".repeat(100)]],
          // Around 13 bytes, from which Node-API decodes a text on its own.
          ["?, ?", ["x".repeat(12), "x".repeat(13)]],
          ["?, ?", ["é".repeat(6), `${"é".repeat(6)}x`]],
          ["?, ?", ["😀😀😀", `\uFEFF${"x".repeat(10)}`]],
          ["cast(x'78787878787878787878ff' as text), ?", ["😀😀😀x"]],
          // Each kind of ill-formed UTF-8 shorter than 13 bytes: overlong,
          // a surrogate, above U+10FFFF, and a bad second, third or fourth
          // byte.
          ["cast(x'e08080' as text), cast(x'f0808080' as text)", []],
          ["cast(x'eda080' as text), cast(x'f4908080' as text)", []],
          ["cast(x'c241' as text), cast(x'e28241' as text)", []],
          ["cast(x'f09f41' as text), cast(x'f09f9841' as text)", []],
          // Lead bytes outside UTF-8's: an overlong two-byte one, a
          // continuation byte and ones above U+10FFFF.
          ["cast(x'c080' as text), cast(x'8080' as text)", []],
          ["cast(x'f5808080' as text), cast(x'f7bfbfbf' as text)", []],
        ];
      // Repeated, so the values after the ones a call passes as its arguments
      // in Node-API, which it passes in a buffer, hold every case too.
      const repeated = Array.from(
        { length: Math.ceil(nodeArgumentValues / (3 * cases.length)) + 1 },
        () => cases,
      ).flat();
      for (const [values, parameters] of repeated)
        run(database, `insert into t (a, b) values (${values})`, parameters);
      const select = "select id, a, b from t order by id";
      // One row at a time, a result of a few values.
      const each = repeated.map(
        (_, index) =>
          run(database, `${select} limit 1 offset ${index}`).rows[0],
      );

      const all = database.run(select, []) as ReadonlyArray<
        Record<string, unknown>
      >;
      const prepared = database.prepare(select);
      const ran = prepared.run([]);
      prepared.finalize();

      // Blobs as their lengths and their bytes' sums first, since a diff of
      // a 70,000-byte one takes tens of GB.
      const compact = (rows: ReadonlyArray<unknown>) =>
        rows.map((row) =>
          Object.fromEntries(
            Object.entries(row as Record<string, unknown>).map(
              ([key, value]) => [
                key,
                value instanceof Uint8Array
                  ? [value.length, value.reduce((sum, byte) => sum + byte, 0)]
                  : value,
              ],
            ),
          ),
        );
      assertEqual(compact(all), compact(each));
      assertEqual(compact(ran as typeof all), compact(each));
      assertEqual(all, each);
      assertEqual(ran, each);
      assertEqual(all[0]?.["a"], "\uFEFFfirst");
      assertEqual(all[5], {
        id: 6,
        a: "a\uFFFDb",
        b: "\uFFFD",
      });
      const blobs = all.flatMap((row) =>
        [row["a"], row["b"]].filter((value) => value instanceof Uint8Array),
      );
      assertEqual(blobs.length, (3 * repeated.length) / cases.length);
      // Plain Uint8Arrays, whichever path created them.
      for (const blob of blobs)
        assertEqual(
          [
            Object.getPrototypeOf(blob) === Uint8Array.prototype,
            blob.byteOffset,
            blob.buffer.byteLength,
          ],
          [true, 0, blob.byteLength],
        );
      assertEqual(new Set(blobs.map((blob) => blob.buffer)).size, blobs.length);
    } finally {
      database.close();
    }
  });

  test("a database's run reads SQL of every length, the ones around 1 KiB with characters of every UTF-8 length at their end too", () => {
    const database = binding.openMemory();
    try {
      for (const last of ["x", "é", "日", "😀"])
        for (let length = 990; length <= 1030; length++) {
          // select '…' as t, whose text ends with last.
          const text = `${"x".repeat(length - 17)}${last}`;
          assertEqual(database.run(`select '${text}' as t`, []), [{ t: text }]);
        }
      const long = "é".repeat(100_000);
      assertEqual(database.run(`select '${long}' as t`, []), [{ t: long }]);
    } finally {
      database.close();
    }
  });

  test("database runs read the column names of each run, of many lists in turn and of lists longer than a few hundred bytes", () => {
    const database = binding.openMemory();
    try {
      // More lists than Node-API keeps the names of, twice over.
      const lists = Array.from({ length: 12 }, (_, list) =>
        Array.from({ length: 1 + (list % 4) }, (_, i) => `c${list}_${i}`),
      );
      lists.push(["a", "b"], ["b", "a"], ["ab"], ["a", "b", "a"]);
      const long = Array.from(
        { length: 40 },
        (_, i) => `column_${i}_${"x".repeat(20)}`,
      );
      for (let round = 0; round < 3; round++)
        for (const names of [...lists, long]) {
          const sql = `select ${names.map((name, i) => `${i} as ${name}`).join(", ")}`;
          const row: Record<string, number> = {};
          for (const [i, name] of names.entries()) row[name] = i;

          assertEqual(database.run(sql, []), [row]);
        }
    } finally {
      database.close();
    }
  });

  test("a result with more than a thousand texts of 13 bytes or more reads each as it was written, short texts, numbers and NULLs between them too", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (a, b)");
      // Whether Node-API passes a text after the first values to takeTexts.
      const isTaken = (value: unknown) => {
        if (typeof value !== "string") return false;
        let bytes = 0;
        for (const char of value) {
          const code = char.codePointAt(0) ?? 0;
          bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
        }
        return (
          bytes >= 13 &&
          (bytes < nodeDecodedText ||
            // oxlint-disable-next-line no-control-regex -- ASCII is U+0000 to U+007F.
            /^[\u0000-\u007F]*$/u.test(value))
        );
      };
      // Around the chunks of the texts after the first values that Node-API
      // passes to takeTexts.
      for (const target of [
        nodeTextChunk - 1,
        nodeTextChunk,
        nodeTextChunk + 1,
        600,
      ]) {
        run(database, "delete from t");
        // Rows until the texts after the first values that Node-API passes to
        // takeTexts reach the target.
        const written: Array<{ a: string; b: string | number | null }> = [];
        let taken = 0;
        for (let i = 0; taken < target; i++) {
          const row = {
            a: `${i % 3 === 0 ? "kůň 😀 " : "text "}${i} ${"x".repeat(i % 29)}`,
            b: i % 4 === 0 ? null : i % 4 === 1 ? i : `s${i % 100}`,
          };
          written.push(row);
          for (const [offset, value] of [row.a, row.b].entries())
            if (
              2 * (written.length - 1) + offset >= nodeArgumentValues &&
              isTaken(value)
            )
              taken++;
        }
        run(database, "begin");
        const insert = database.prepare("insert into t values (?, ?)");
        for (const { a, b } of written) insert.run(values(a, b));
        insert.finalize();
        run(database, "commit");
        const select = "select a, b from t order by rowid";

        assertEqual(database.run(select, []), written);
        const prepared = database.prepare(select);
        assertEqual(prepared.run([]), written);
        prepared.finalize();
      }
    } finally {
      database.close();
    }
  });

  test("a result larger than a few values keeps the byte order mark of each text, the first one after a few values too", () => {
    const database = binding.openMemory();
    try {
      // Rows of two values, more of them than a call passes as its arguments
      // in Node-API.
      const count = nodeArgumentValues;
      const sql = `with r(n) as (select 1 union all select n + 1 from r where n < ${count}) select n, char(65279) || n as t from r`;

      assertEqual(
        database.run(sql, []),
        Array.from({ length: count }, (_, i) => ({
          n: i + 1,
          t: `\uFEFF${i + 1}`,
        })),
      );
    } finally {
      database.close();
    }
  });

  test("a step of a row wider than a few values reads each value as a narrow row does", () => {
    const database = binding.openMemory();
    try {
      const columns = [
        "null",
        "1",
        "2.5",
        "'\uFEFFtext'",
        "''",
        "cast(x'61ff' as text)",
        "x'0102'",
        "zeroblob(0)",
        "'kůň'",
      ];
      const width = nodeArgumentValues + 2;
      const wide = Array.from(
        { length: width },
        (_, i) => `${columns[i % columns.length]} as c${i}`,
      ).join(", ");
      const narrow = Object.fromEntries(
        Array.from({ length: width }, (_, i) => [
          `c${i}`,
          rowsOf(database, `select ${columns[i % columns.length]} as c`)[0]?.[
            "c"
          ],
        ]),
      );
      const statement = database.prepare(`select ${wide}`);
      statement.bind([]);

      assertEqual(statement.step(), narrow);
      statement.finalize();
    } finally {
      database.close();
    }
  });

  test("database run prepares, runs and finalizes one statement without a statement handle, and returns what a statement's run does", () => {
    const database = binding.openMemory();
    try {
      assertEqual(database.run("create table t (a primary key, b)", []), 0);
      assertEqual(
        database.run(
          "insert into t values (?, ?), (?, ?)",
          values(1, "x", 2, null),
        ),
        2,
      );
      assertEqual(database.run("select a, b from t order by a", []), [
        { a: 1, b: "x" },
        { a: 2, b: null },
      ]);
      assertEqual(database.run("select a from t where a > ?", values(2)), 0);
      assertEqual(
        database.run(
          "insert into t values (3, ?) returning a, b",
          values(new Uint8Array([7])),
        ),
        { rows: [{ a: 3, b: new Uint8Array([7]) }], changes: 1 },
      );
      const [row] = database.run(
        'select 1 as a, 2 as a, 3 as "__proto__", 4 as constructor',
        [],
      ) as ReadonlyArray<Record<string, unknown>>;
      assertEqual(inheritsNothing(row), true);
      assertEqual(Object.entries(row), [
        ["a", 2],
        ["__proto__", 3],
        ["constructor", 4],
      ]);
    } finally {
      database.close();
    }
  });

  test("database run refuses SQL as prepare does, and throws SQLite's error of a prepare with its byte offset", () => {
    const database = binding.openMemory();
    try {
      assertEqual(
        thrownBy(() => database.run(" ;", [])),
        errorWith("The SQL contains no statement.", {
          type: "SqliteEmptySqlError",
        }),
      );
      assertEqual(
        thrownBy(() => database.run("select 1; select 2", [])),
        errorWith("The SQL contains more than one statement.", {
          type: "SqliteMultipleStatementsError",
        }),
      );
      assertEqual(
        thrownBy(() => database.run("select 1\0", [])),
        errorWith("The SQL contains a NUL character.", {
          type: "SqliteInvalidSqlText",
        }),
      );
      assertEqual(
        thrownBy(() => database.run("select '\uD800'", [])),
        errorWith("The SQL contains a lone surrogate.", {
          type: "SqliteInvalidSqlText",
        }),
      );
      assertEqual(
        thrownBy(() => database.run(`select '${"x".repeat(2000)}\uD800'`, [])),
        errorWith("The SQL contains a lone surrogate.", {
          type: "SqliteInvalidSqlText",
        }),
      );
      assertEqual(
        thrownBy(() => database.run(1 as never, [])),
        typeError("The SQL must be a string."),
      );
      assertEqual(
        thrownBy(() => database.run("select 'kůň', nope", [])),
        sqliteError({
          operation: "prepare",
          extendedCode: 1,
          message: "no such column: nope",
          sqlOffset: 16,
        }),
      );
    } finally {
      database.close();
    }
  });

  test("database run binds as a statement's run does, and throws its TypeErrors and SQLite's error of a step", () => {
    const database = binding.openMemory();
    try {
      database.run("create table t (a primary key)", []);
      const insert = "insert into t values (?)";

      assertEqual(
        thrownBy(() => database.run(insert, [])),
        typeError("Expected 1 parameters, got 0."),
      );
      assertEqual(
        thrownBy(() => database.run(insert, "x" as never)),
        typeError("The parameters must be an array."),
      );
      // Before the SQL's own error, since it reads the parameters first.
      assertEqual(
        thrownBy(() => database.run("select from", "x" as never)),
        typeError("The parameters must be an array."),
      );
      assertEqual(
        thrownBy(() => database.run(insert, [undefined as never])),
        typeError(
          "A parameter must be null, a finite number, a string or a Uint8Array.",
        ),
      );
      assertEqual(database.run(insert, values(1)), 1);
      assertEqual(
        thrownBy(() => database.run(insert, values(1))),
        sqliteError({
          operation: "step",
          extendedCode: 1555,
          message: "UNIQUE constraint failed: t.a",
        }),
      );
      assertEqual(database.run("select a from t", []), [{ a: 1 }]);
    } finally {
      database.close();
    }
  });

  test("database run whose parameter's getter closes the database throws before it binds", () => {
    const database = binding.openMemory();
    const parameters: Array<TestValue> = [];
    Object.defineProperty(parameters, "0", {
      enumerable: true,
      get: () => {
        database.close();
        return 1;
      },
    });

    assertEqual(
      thrownBy(() =>
        database.run(
          "select ? as a",
          parameters as unknown as ReadonlyArray<SqliteValue>,
        ),
      ),
      { kind: "Error", message: "The database is closed.", cause: undefined },
    );
  });

  test("database run whose error's creation closes the database throws its error", () => {
    const database = binding.openMemory();
    const stack = Object.getOwnPropertyDescriptor(Error.prototype, "stack");
    let hook: (() => void) | null = () => {
      database.close();
    };
    // Hermes reads a new error's stack through Error.prototype's accessor.
    // oxlint-disable-next-line eslint/no-extend-native -- Creating an error must run JavaScript.
    Object.defineProperty(Error.prototype, "stack", {
      configurable: true,
      get() {
        const close = hook;
        hook = null;
        close?.();
        return "";
      },
    });
    let thrown: unknown = null;
    try {
      thrown = thrownBy(() => database.run("select ?", []));
    } finally {
      // oxlint-disable-next-line eslint/no-extend-native -- Restored.
      if (stack) Object.defineProperty(Error.prototype, "stack", stack);
      else
        delete (Error.prototype as unknown as Record<string, unknown>)["stack"];
      database.close();
    }

    assertEqual(thrown, typeError("Expected 1 parameters, got 0."));
  });

  test("a database run whose index setter of Array.prototype, or setter of Object.prototype for rows, closes the database returns its rows", () => {
    // Node-API's row builder creates { rows, changes } as a literal, which runs
    // no setter, so only JSI's reaches the one for rows.
    const closedBy: Array<string> = [];
    for (const [prototype, key] of [
      [Array.prototype, "0"],
      [Object.prototype, "rows"],
    ] as const) {
      const database = binding.openMemory();
      try {
        run(database, "create table t (a)");
        let hook: (() => void) | null = () => {
          closedBy.push(key);
          database.close();
        };
        Object.defineProperty(prototype, key, {
          configurable: true,
          // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
          set(this: object, value: unknown) {
            const close = hook;
            hook = null;
            close?.();
            Object.defineProperty(this, key, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });
        let result: unknown = null;
        try {
          result = database.run(
            "insert into t values (1), (2) returning a",
            [],
          );
        } finally {
          delete (prototype as unknown as Record<string, unknown>)[key];
        }

        assertEqual(result, { rows: [{ a: 1 }, { a: 2 }], changes: 2 });
      } finally {
        database.close();
      }
    }
    assertEqual(closedBy.includes("0"), true);
  });

  test("export returns the plaintext database as an ArrayBuffer, also of an encrypted file", () => {
    const path = pathOf("export.db");
    const database = binding.openEncryptedFile(path, key);
    try {
      run(database, "create table t (a)");
      run(database, "insert into t values (?)", ["evolu-exported-row"]);

      const exported = database.export();

      assertEqual(exported instanceof ArrayBuffer, true);
      assertEqual(exported.byteLength % 4096, 0);
      const bytes = new Uint8Array(exported);
      assertEqual(bytesToHex(bytes.subarray(0, 16)), sqliteHeader);
      assertEqual(
        bytesToHex(bytes).includes(
          bytesToHex(
            Uint8Array.from("evolu-exported-row", (c) => c.charCodeAt(0)),
          ),
        ),
        true,
      );
    } finally {
      database.close();
    }
  });

  test("export inside a write transaction fails with SQLITE_BUSY and leaves the transaction open", () => {
    const database = binding.openMemory();
    try {
      run(database, "create table t (a)");
      run(database, "begin");
      run(database, "insert into t values (1)");

      assertEqual(
        thrownBy(() => database.export()),
        sqliteError({
          operation: "export",
          extendedCode: 5,
          message: "database is locked",
        }),
      );
      run(database, "commit");
      assertEqual(rowsOf(database, "select a from t"), [{ a: 1 }]);
      assertEqual(database.export().byteLength > 0, true);
    } finally {
      database.close();
    }
  });

  test("close finalizes the statements, releases the file and is idempotent, and handles of a closed database or a finalized statement throw", () => {
    const path = pathOf("closed.db");
    const database = binding.openFile(path);
    run(database, "create table t (a)");
    run(database, "insert into t values (1), (2)");
    const stepped = database.prepare("select a from t");
    stepped.bind([]);
    assertEqual(stepped.step(), { a: 1 });
    const finalized = database.prepare("select 1");
    finalized.finalize();

    database.close();
    database.close();

    assertEqual(binding.isFileOpen(path), false);
    const closed = {
      kind: "Error",
      message: "The database is closed.",
      cause: undefined,
    };
    assertEqual(
      thrownBy(() => database.prepare("select 1")),
      closed,
    );
    assertEqual(
      thrownBy(() => database.export()),
      closed,
    );
    assertEqual(
      thrownBy(() => database.run("select 1", [])),
      closed,
    );
    const notLive = {
      kind: "Error",
      message: "The statement is finalized.",
      cause: undefined,
    };
    for (const statement of [stepped, finalized]) {
      assertEqual(
        thrownBy(() => statement.run([])),
        notLive,
      );
      assertEqual(
        thrownBy(() => {
          statement.bind([]);
        }),
        notLive,
      );
      assertEqual(
        thrownBy(() => statement.step()),
        notLive,
      );
      assertEqual(
        thrownBy(() => {
          statement.reset();
        }),
        notLive,
      );
      assertEqual(
        thrownBy(() => {
          statement.finalize();
        }),
        notLive,
      );
    }
  });

  test("close releases a file whose skiplist functions ran, which keep statements of their own until it closes", () => {
    const path = pathOf("skiplist.db");
    const database = binding.openFile(path);
    run(
      database,
      'create table evolu_timestamp ("ownerId" blob not null, "t" blob not null, "h1" integer, "h2" integer, "c" integer, "l" integer not null, primary key ("ownerId", "t")) strict',
    );
    run(database, "begin");
    run(
      database,
      "select evolu_skiplist_insert(zeroblob(16), zeroblob(16), 2)",
    );
    run(database, "commit");
    const size = "select evolu_skiplist_size(zeroblob(16)) as size";
    assertEqual(rowsOf(database, size), [{ size: 1 }]);

    database.close();

    assertEqual(binding.isFileOpen(path), false);
    const reopened = binding.openFile(path);
    assertEqual(rowsOf(reopened, size), [{ size: 1 }]);
    reopened.close();
  });

  test("a method called on another kind of object throws a TypeError", () => {
    const database = binding.openMemory();
    try {
      const statement = database.prepare("select 1");
      // The functions of the prototype the handles share, which may also
      // hold a constructor or the prototype of the handles a handle creates.
      const methodsOf = (
        handle: NativeSqliteDatabase | NativeSqliteStatement,
      ) => {
        const prototype = Object.getPrototypeOf(handle) as Record<
          string,
          unknown
        >;
        return Object.getOwnPropertyNames(prototype).flatMap((name) => {
          const value = prototype[name];
          return name !== "constructor" && typeof value === "function"
            ? [[name, value as (...args: Array<unknown>) => unknown] as const]
            : [];
        });
      };
      const databaseMethods = methodsOf(database);
      const statementMethods = methodsOf(statement);
      assertEqual(databaseMethods.map(([name]) => name).toSorted(), [
        "close",
        "export",
        "prepare",
        "run",
      ]);
      assertEqual(statementMethods.map(([name]) => name).toSorted(), [
        "bind",
        "finalize",
        "reset",
        "run",
        "step",
      ]);

      for (const [, method] of databaseMethods)
        for (const other of [statement, {}, null])
          assertEqual(
            thrownBy(() => method.call(other, "select 1")),
            typeError("Expected a database."),
          );
      for (const [, method] of statementMethods)
        for (const other of [database, {}, undefined])
          assertEqual(
            thrownBy(() => method.call(other, [])),
            typeError("Expected a statement."),
          );
      statement.finalize();
    } finally {
      database.close();
    }
  });
};
