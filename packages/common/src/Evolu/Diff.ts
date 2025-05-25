import { nanoid } from "nanoid";
import { isPlainObject, ReadonlyRecord } from "../Object.js";
import { orderUint8Array } from "../Order.js";
import { SqliteValue } from "../Sqlite.js";
import { String } from "../Type.js";
import { Query, Row } from "./Query.js";

export interface QueryPatches {
  readonly query: Query;
  readonly patches: ReadonlyArray<Patch>;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: ReadonlyArray<Row>;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Row;
}

export const applyPatches = (
  patches: ReadonlyArray<Patch>,
  current: ReadonlyArray<Row>,
): ReadonlyArray<Row> =>
  patches.reduce((next, patch) => {
    switch (patch.op) {
      case "replaceAll":
        return parseSqliteJsonArray(patch.value);
      case "replaceAt": {
        const parsedRow = parseSqliteJsonArray([patch.value])[0];
        return next.toSpliced(patch.index, 1, parsedRow);
      }
    }
  }, current);

/**
 * We detect only changes in the whole result and in-place edits. In the future,
 * we will add more heuristics. We will probably not implement the Myers diff
 * algorithm because it's faster to rerender all than to compute many detailed
 * patches. We will only implement logic a developer would implement manually,
 * if necessary.
 */
export const makePatches = (
  previousRows: ReadonlyArray<Row> | undefined,
  nextRows: ReadonlyArray<Row>,
): ReadonlyArray<Patch> => {
  if (previousRows === undefined)
    return [{ op: "replaceAll", value: nextRows }];
  // TODO: Detect prepend and append, it's cheap.
  if (previousRows.length !== nextRows.length) {
    return [{ op: "replaceAll", value: nextRows }];
  }

  const length = previousRows.length;
  const replaceAtPatches: Array<ReplaceAtPatch> = [];

  for (let i = 0; i < length; i++) {
    const previousRow = previousRows[i];
    const nextRow = nextRows[i];

    // We expect the same shape for both rows.
    for (const key in previousRow)
      if (
        !areEqual(previousRow[key] as SqliteValue, nextRow[key] as SqliteValue)
      ) {
        replaceAtPatches.push({ op: "replaceAt", value: nextRow, index: i });
        break;
      }
  }

  if (length > 0 && replaceAtPatches.length === length) {
    return [{ op: "replaceAll", value: nextRows }];
  }
  return replaceAtPatches;
};

// TODO: Replace with eqSqliteValue.
const areEqual = (a: SqliteValue, b: SqliteValue): boolean => {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return orderUint8Array(a, b) === 0;
  }
  return a === b;
};

/**
 * A unique identifier prepended to JSON-encoded strings. This allows safe
 * detection and parsing of only those columns that require JSON.parse.
 *
 * The identifier is generated using nanoid to ensure randomness and uniqueness,
 * preventing malicious actors from inserting fake data that could be
 * misinterpreted as JSON by the application.
 *
 * Note: The same queries created by different browser tabs will have different
 * identifiers and thus be considered different and cached separately. This is
 * usually not a big deal, but if needed, the DB cache can be optimized by
 * passing the kyselyJsonIdentifier into the DB worker during initialization,
 * allowing queries to be grouped and recognized across tabs or sessions.
 *
 * See: https://github.com/kysely-org/kysely/issues/1372#issuecomment-2702773948
 */
export const kyselyJsonIdentifier = nanoid();

export const parseSqliteJsonArray = <T>(
  arr: ReadonlyArray<T>,
): ReadonlyArray<T> => {
  const result = new Array<T>(arr.length);
  for (let i = 0; i < arr.length; ++i) {
    result[i] = parse(arr[i]) as T;
  }
  return result;
};

const parse = (obj: unknown): unknown => {
  if (String.is(obj) && obj.startsWith(kyselyJsonIdentifier)) {
    return JSON.parse(obj.slice(kyselyJsonIdentifier.length));
  }

  if (Array.isArray(obj)) {
    return parseSqliteJsonArray(obj);
  }

  if (isPlainObject(obj)) {
    return parseObject(obj);
  }

  return obj;
};

const parseObject = (
  obj: ReadonlyRecord<string, unknown>,
): ReadonlyRecord<string, unknown> => {
  const result = Object.create(null) as Record<string, unknown>;
  for (const key in obj) {
    result[key] = parse(obj[key]);
  }
  return result as ReadonlyRecord<string, unknown>;
};
