/**
 * The row builder of the Node-API binding of Evolu's SQLite core, which its
 * `createBinding` takes: V8 builds an object faster than Node-API creates one
 * and sets its properties one call at a time, so C passes a call's values to
 * these functions, which build the rows.
 *
 * - The runs of statements and databases and the steps of statements, the calls
 *   that matter most, are this module's, which the binding's prototypes hold:
 *   they pass the id of `this`, a number under a symbol, to a native, which
 *   costs a fraction of the type tag and unwrap of the binding's own methods.
 *   Object.getOwnPropertySymbols reveals the symbol, so the native refuses an
 *   id of no live handle of its kind. A result or row of a few numbers or
 *   NULLs, and at most one text or blob, calls no JavaScript: the binding
 *   leaves the numbers in memory it shares with its builder and the text or
 *   blob in `objects`, and the run or step builds the rows after the native
 *   returns. Appending them can run a setter, so a statement's run then settles
 *   the statement when the binding counted a call that could have changed it,
 *   as the binding does after it appends rows.
 * - A call passes the keys of its column names, its changes and the count of its
 *   values, then, when there are more than 1,024, one `ArrayBuffer` of all of
 *   them and the texts and blobs of the first 1,024, which {@link decodeRows}
 *   reads, so a large result takes a few Node-API calls instead of two per
 *   value, and then the first values, which Node-API created. A statement's
 *   keys come through `holder[0]`, from index 0, which `take` reads and
 *   replaces with a new object before any other JavaScript runs. Keys of up to
 *   19 columns, whose rows V8 keeps fast, keep a row of NULLs that `take`
 *   builds of them, so V8 keeps the map of their rows, and the code built for
 *   it, also while no row of them is alive, which it otherwise drops after a
 *   few collections, making the next call build both again.
 * - The short texts of a buffer, of fewer than 13 bytes of UTF-8, decode together
 *   and are sliced out, and V8 copies a slice shorter than 13 UTF-16 code
 *   units, so a row kept from a result keeps no other row's texts. The binding
 *   creates each other text that's ASCII or has fewer than 76 bytes, which V8
 *   copies, and passes them to `takeTexts` in chunks of a few hundred before it
 *   calls for the rows, since that costs a fraction of decoding each here, and
 *   a call's first chunk drops the texts of a call that failed before it. Each
 *   other text decodes on its own, which reads that much UTF-8 that isn't ASCII
 *   faster than V8 creates a string of it. Both put U+FFFD in place of each
 *   ill-formed sequence, as the WHATWG decoder reads it. A blob is a copy with
 *   a buffer of its own, which the binding creates for one of 64 bytes or more
 *   after the first 1,024 values and passes with the texts.
 * - The binding keeps references to the functions and the holder its
 *   environment's first `createBinding` took, so nothing replaces them later,
 *   and they call the functions of other objects through references this module
 *   takes when it loads. A row's prototype, and that of a statement's keys, is
 *   the one the builder was created with, `@evolu/common`'s `emptyPrototype` in
 *   `@evolu/nodejs`, so a row inherits nothing, and V8 keeps its properties
 *   fast. Every other object they create but a run's rows and result, and
 *   `objects`, whose only element is its own, has no prototype and is created
 *   by a literal, so no setter or getter runs while they build rows, and no
 *   function replaced after this module loaded, such as `Object.create`. One
 *   replaced before runs then, which is trusted: the values are its to keep,
 *   and the binding stays memory-safe whatever it does, though one that runs
 *   the binding again while rows are built can make them wrong. A run's rows
 *   are appended to its result with ordinary sets, as the binding's conformance
 *   suite pins.
 *
 * @module
 */
// Types only, so NativeSqlite.ts, which imports this module, imports only it
// and Node.js's own modules at run time.
import type {
  NativeSqliteRunResult,
  SqliteRow,
  SqliteValueInput,
} from "@evolu/common";

/** The values of a call's keys of its columns. */
type Values = Readonly<Record<number, SqliteValueInput>>;

/**
 * Where rows go, from index 0: a run's rows, appended with ordinary sets, or an
 * object without a prototype for a step's row.
 */
type Rows = Record<number, SqliteRow>;

/** The keys of a statement's column names, with their count. */
interface Names {
  readonly length: number;
  readonly [index: number]: string;
}

/** What the binding's `createBinding` takes. */
export interface NativeSqliteRowBuilder {
  /** Holds, as its element 0, what a call appends the keys of columns to. */
  readonly holder: Record<0, Values>;
  /**
   * Holds, as its own element 0, the one text or blob of the values that a run
   * leaves in the shared memory.
   */
  readonly objects: Array<SqliteValueInput>;
  /** Returns the first `count` values as the keys of a statement's columns. */
  readonly take: (count: number) => Names;
  /**
   * Returns a run's rows when its changes are 0, and both otherwise, built of
   * `count` values, the passed ones or a buffer's.
   */
  readonly createRows: (
    names: Names,
    changes: number,
    count: number,
    ...passed: ReadonlyArray<SqliteValueInput | ArrayBuffer>
  ) => NativeSqliteRunResult;
  /** Returns a step's row, built of the passed values or a buffer's. */
  readonly createRowOfStep: (
    names: Names,
    changes: number,
    count: number,
    ...passed: ReadonlyArray<SqliteValueInput | ArrayBuffer>
  ) => SqliteRow;
  /**
   * Takes the next texts and blobs of the values of the call that createRows or
   * createRowOfStep builds rows of next, a chunk at a time, dropping the ones
   * it took before when it's a call's first chunk.
   */
  readonly takeTexts: (
    isFirst: boolean,
    ...texts: ReadonlyArray<string | Uint8Array>
  ) => void;
  /** A statement's run, which the prototype of statements holds. */
  readonly run: (this: unknown, parameters: unknown) => NativeSqliteRunResult;
  /** A statement's step, which the prototype of statements holds. */
  readonly step: (this: unknown) => SqliteRow | null;
  /** A database's run, which the prototype of databases holds. */
  readonly runDatabase: (
    this: unknown,
    sql: unknown,
    parameters: unknown,
  ) => NativeSqliteRunResult;
  /**
   * Takes the natives that the runs and step call with a handle's id, the
   * memory the binding shares, and the keys of the ids of statements and
   * databases.
   */
  readonly connect: (
    run: (id: unknown, parameters: unknown) => unknown,
    runDatabase: (
      id: unknown,
      sql: unknown,
      parameters: unknown,
      isWellFormed: boolean,
    ) => unknown,
    settle: (id: unknown) => void,
    shared: ArrayBuffer,
    statementKey: symbol,
    databaseKey: symbol,
    step: (id: unknown) => unknown,
  ) => void;
}

/** The chunks of texts and blobs that takeTexts took, in order. */
interface Texts {
  length: number;
  [index: number]: ReadonlyArray<string | Uint8Array>;
}

/** A handle, whose id a symbol the binding passes to connect holds. */
type Handle = Readonly<Record<symbol, unknown>> | null | undefined;

/**
 * Creates a {@link NativeSqliteRowBuilder} with a holder of its own, whose rows,
 * and the keys of a statement's columns, have rowPrototype, which
 * `@evolu/nodejs` passes as `@evolu/common`'s `emptyPrototype`.
 */
export const createNativeSqliteRowBuilder = (
  rowPrototype: object,
): NativeSqliteRowBuilder => {
  const holder: Record<0, Values> = {
    __proto__: null,
    0: { __proto__: null },
  } as Record<0, Values>;

  const objects: Array<SqliteValueInput> = [null];
  let pendingTexts = { __proto__: null, length: 0 } as Texts;

  // What connect sets.
  let runNative: Parameters<NativeSqliteRowBuilder["connect"]>[0] =
    disconnected;
  let runDatabaseNative: Parameters<NativeSqliteRowBuilder["connect"]>[1] =
    disconnected;
  let settleNative: Parameters<NativeSqliteRowBuilder["connect"]>[2] =
    disconnected;
  let stepNative: Parameters<NativeSqliteRowBuilder["connect"]>[6] =
    disconnected;
  let shared = new F64(sharedNumbers + argumentValues);
  let sharedKinds = new U8(argumentValues);
  let statementKey = disconnectedKey;
  let databaseKey = disconnectedKey;

  // The rows of the values a run left in the shared memory and objects, all
  // built before the first is appended, since an append can run a setter that
  // runs another statement over them. A statement, whose id is undefined for a
  // database's run, is settled when a setter could have changed it, as the
  // binding does after it appends rows, also after an append threw, whose
  // error then propagates.
  const appendShared = (
    names: Names,
    statement: unknown,
  ): NativeSqliteRunResult => {
    const count = shared[sharedCount];
    const changes = shared[sharedChanges];
    const calls = shared[sharedCalls];
    // Taken, so the builder keeps no row's text or blob. An own element of an
    // array only the builder has, so the set runs no setter.
    const object = objects[0];
    objects[0] = null;
    const width = names.length;
    const rows: Array<SqliteRow> = [];
    let isAppended = false;
    try {
      if (count === width) rows[0] = createSharedRow(names, 0, object);
      else {
        const built = { __proto__: null } as Rows;
        let length = 0;
        for (let i = 0; i < count; i += width)
          built[length++] = createSharedRow(names, i, object);
        for (let i = 0; i < length; i++) rows[i] = built[i];
      }
      isAppended = true;
    } finally {
      if (statement !== undefined && shared[sharedCalls] !== calls) {
        if (isAppended) settleNative(statement);
        else
          try {
            settleNative(statement);
          } catch {
            // The append's error propagates, as the binding's does.
          }
      }
    }
    return changes === 0 ? rows : { rows, changes };
  };

  // The texts of the call whose rows are built now, which a call that a setter
  // runs while they're appended can't change.
  const takePendingTexts = (): Texts => {
    const texts = pendingTexts;
    if (texts.length > 0)
      pendingTexts = { __proto__: null, length: 0 } as Texts;
    return texts;
  };

  const createSharedRow = (
    names: Names,
    at: number,
    object: SqliteValueInput,
  ): SqliteRow => {
    const row = create(rowPrototype) as Record<string, SqliteValueInput>;
    const width = names.length;
    for (let j = 0; j < width; j++)
      setColumn(
        row,
        names,
        j,
        sharedKinds[at + j] === kindNumber
          ? shared[sharedNumbers + at + j]
          : sharedKinds[at + j] === kindNull
            ? null
            : object,
      );
    return row;
  };

  return {
    holder,
    objects,
    take: (count) => {
      const values = holder[0];
      holder[0] = { __proto__: null } as Values;
      // On a row's prototype, so V8 reads its keys fast.
      const taken = create(rowPrototype) as {
        length: number;
        row: unknown;
        [index: number]: string;
      };
      for (let i = 0; i < count; i++) taken[i] = values[i] as string;
      taken.length = count;
      // Kept by the keys, so V8 keeps the map of their rows. A row of more
      // columns is a dictionary, whose map no statement keeps.
      let row: Record<string, SqliteValueInput> | null = null;
      if (count <= fastRowColumns) {
        row = create(rowPrototype) as Record<string, SqliteValueInput>;
        for (let j = 0; j < count; j++) setColumn(row, taken, j, null);
      }
      taken.row = row;
      return taken;
    },
    createRows: (names, changes, count, ...passed) => {
      const rows: Array<SqliteRow> = [];
      decodeRows(names, count, passed, takePendingTexts(), rowPrototype, rows);
      return changes === 0 ? rows : { rows, changes };
    },
    createRowOfStep: (names, _changes, count, ...passed) => {
      // Built here, since a holder of one row costs a row more.
      if (count <= argumentValues) {
        const row = create(rowPrototype) as Record<string, SqliteValueInput>;
        for (let j = 0; j < count; j++)
          setColumn(row, names, j, passed[j] as SqliteValueInput);
        return row;
      }
      const row = { __proto__: null } as Record<number, SqliteRow>;
      decodeRows(names, count, passed, takePendingTexts(), rowPrototype, row);
      return row[0];
    },
    takeTexts: (isFirst, ...texts) => {
      // A call that failed before its rows were built left its texts.
      if (isFirst) pendingTexts = { __proto__: null, length: 0 } as Texts;
      pendingTexts[pendingTexts.length++] = texts;
    },
    run: function (parameters) {
      const id = (this as Handle)?.[statementKey];
      const result = runNative(id, parameters);
      return shared[sharedCount] === 0
        ? (result as NativeSqliteRunResult)
        : appendShared(result as Names, id);
    },
    step: function () {
      const result = stepNative((this as Handle)?.[statementKey]);
      if (shared[sharedCount] === 0) return result as SqliteRow | null;
      // Taken, as a run's.
      const object = objects[0];
      objects[0] = null;
      return createSharedRow(result as Names, 0, object);
    },
    runDatabase: function (sql, parameters) {
      const result = runDatabaseNative(
        (this as Handle)?.[databaseKey],
        sql,
        parameters,
        typeof sql === "string" && isWellFormed(sql),
      );
      return shared[sharedCount] === 0
        ? (result as NativeSqliteRunResult)
        : appendShared(result as Names, undefined);
    },
    connect: (run, runDatabase, settle, memory, statement, database, step) => {
      runNative = run;
      runDatabaseNative = runDatabase;
      settleNative = settle;
      stepNative = step;
      shared = new F64(memory, 0, sharedNumbers + argumentValues);
      sharedKinds = new U8(
        memory,
        8 * (sharedNumbers + argumentValues),
        argumentValues,
      );
      statementKey = statement;
      databaseKey = database;
    },
  };
};

// How many values a call passes as arguments, the binding's ARGUMENT_VALUES: a
// call of more passes a buffer of the others first.
const argumentValues = 1024;

// The most columns of a row that V8 keeps fast: it makes an object a dictionary
// once computed keys set more properties, as Node.js 24's V8 does.
const fastRowColumns = 19;

// The layout of the memory the binding shares, as its C writes it: a run's
// count of values when they're there, its changes and a count of the calls
// that could change a statement, then argumentValues values as doubles and
// their kinds.
const sharedCount = 0;
const sharedChanges = 1;
const sharedCalls = 2;
const sharedNumbers = 3;

// What a builder holds before the binding connects it.
const disconnected = (): never => {
  throw new TypeError("The row builder isn't connected to the binding.");
};
const disconnectedKey = Symbol("disconnected");

// What decodeRows calls, taken when the module loads, the methods uncurried,
// so each is called with a this of its own.
const U8 = Uint8Array;
const F64 = Float64Array;
const { create } = Object;
// oxlint-disable-next-line typescript/unbound-method -- Uncurried.
const { call } = Function.prototype;
const decodeUtf8 = call.bind(
  // oxlint-disable-next-line typescript/unbound-method -- Uncurried.
  TextDecoder.prototype.decode,
) as (decoder: InstanceType<typeof TextDecoder>, input: Uint8Array) => string;
const sliceString = call.bind(
  // oxlint-disable-next-line typescript/unbound-method -- Uncurried.
  String.prototype.slice,
) as (text: string, start: number, end: number) => string;
const isWellFormed = call.bind(
  // oxlint-disable-next-line typescript/unbound-method -- Uncurried.
  String.prototype.isWellFormed,
) as (text: string) => boolean;
// A byte order mark that starts what a call decodes is a text's, not the
// stream's. The options have no prototype, so a property of Object.prototype
// set before this module loaded, such as fatal, changes none of them.
const decoder = new TextDecoder("utf-8", {
  __proto__: null,
  ignoreBOM: true,
} as { readonly ignoreBOM: boolean });

/**
 * Sets a row's column, with a store for each of the first column positions, so
 * a statement whose rows are built again and again stores each column through
 * an inline cache that sees one name, while V8's store of a computed key goes
 * megamorphic, which costs several times more, once it sees a second. A
 * position that many statements share, such as an `id` first, goes megamorphic
 * like the one store would.
 */
const setColumn = (
  row: Record<string, SqliteValueInput>,
  names: Names,
  column: number,
  value: SqliteValueInput,
): void => {
  switch (column) {
    case 0:
      row[names[0]] = value;
      break;
    case 1:
      row[names[1]] = value;
      break;
    case 2:
      row[names[2]] = value;
      break;
    case 3:
      row[names[3]] = value;
      break;
    case 4:
      row[names[4]] = value;
      break;
    case 5:
      row[names[5]] = value;
      break;
    case 6:
      row[names[6]] = value;
      break;
    case 7:
      row[names[7]] = value;
      break;
    default:
      row[names[column]] = value;
  }
};

// The kinds of value, as the binding's C writes them; 5 is a text that decodes
// on its own.
const kindNull = 0;
const kindNumber = 1;
const kindShortText = 2;
// A text or blob that takeTexts took.
const kindText = 3;
const kindBlob = 4;
// A text or blob of the first argumentValues, which a call passes.
const kindObject = 6;

/**
 * Sets the rows of count values, names.length to a row, in rows. They're the
 * passed ones when there are at most argumentValues, and otherwise a buffer's,
 * the first passed, followed by the texts and blobs of the first
 * argumentValues: the buffer, as the binding's C writes it, holds the byte
 * length of its short texts and a number per value, as doubles, then a kind per
 * value, the UTF-8 of the short texts and the bytes of blobs of fewer than 64
 * bytes and of the texts that decode on their own, and texts holds the other
 * texts and blobs after the first argumentValues. The number is the value of a
 * number, the UTF-16 length of a short text and the byte length otherwise. The
 * binding writes the buffer again for its next call, so this builds every row
 * before it sets the first in rows, which can run a setter that runs another
 * statement.
 */
const decodeRows = (
  names: Names,
  count: number,
  passed: ReadonlyArray<SqliteValueInput | ArrayBuffer>,
  texts: Texts,
  rowPrototype: object,
  rows: Rows,
): void => {
  const width = names.length;
  let length = 0;
  if (count <= argumentValues) {
    for (let i = 0; i < count; i += width) {
      const row = create(rowPrototype) as Record<string, SqliteValueInput>;
      for (let j = 0; j < width; j++)
        setColumn(row, names, j, passed[i + j] as SqliteValueInput);
      rows[length++] = row;
    }
    return;
  }
  const buffer = passed[0] as ArrayBuffer;
  const built = { __proto__: null } as Rows;
  const numbers = new F64(buffer, 0, 1 + count);
  const kindsAt = 8 * (1 + count);
  const kinds = new U8(buffer, kindsAt, count);
  const textAt = kindsAt + count;
  const textSize = numbers[0];
  const text =
    textSize > 0 ? decodeUtf8(decoder, new U8(buffer, textAt, textSize)) : "";
  let textOffset = 0;
  let bytesAt = textAt + textSize;
  let chunk = 0;
  let chunkTexts = texts[0];
  let chunkOffset = 0;
  let object = 1;
  let row = create(rowPrototype) as Record<string, SqliteValueInput>;
  let column = 0;
  for (let i = 0; i < count; i++) {
    let value: SqliteValueInput;
    const kind = kinds[i];
    if (kind === kindNumber) value = numbers[1 + i];
    else if (kind === kindText) {
      value = chunkTexts[chunkOffset];
      if (++chunkOffset === chunkTexts.length) {
        chunkTexts = texts[++chunk];
        chunkOffset = 0;
      }
    } else if (kind === kindObject)
      value = passed[object++] as SqliteValueInput;
    else if (kind === kindShortText) {
      const units = numbers[1 + i];
      value = sliceString(text, textOffset, textOffset + units);
      textOffset += units;
    } else if (kind === kindNull) value = null;
    else {
      const size = numbers[1 + i];
      const bytes = new U8(buffer, bytesAt, size);
      bytesAt += size;
      value = kind === kindBlob ? new U8(bytes) : decodeUtf8(decoder, bytes);
    }
    setColumn(row, names, column, value);
    if (++column === width) {
      built[length++] = row;
      row = create(rowPrototype) as Record<string, SqliteValueInput>;
      column = 0;
    }
  }
  for (let i = 0; i < length; i++) rows[i] = built[i];
};
