import * as Predicate from "effect/Predicate";
import * as ReadonlyArray from "effect/ReadonlyArray";
import { Query, Row } from "./Db.js";
import { Value } from "./Sqlite.js";

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

export const applyPatches =
  (patches: ReadonlyArray<Patch>) =>
  (current: ReadonlyArray<Row>): ReadonlyArray<Row> =>
    patches.reduce((next, patch) => {
      switch (patch.op) {
        case "replaceAll":
          return patch.value;
        case "replaceAt": {
          return ReadonlyArray.replace(next, patch.index, patch.value);
        }
      }
    }, current);

// We detect only a change in the whole result and in-place edits.
// In the future, we will add more heuristics. We will probably not implement
// the Myers diff algorithm because it's faster to rerender all than
// to compute many detailed patches. We will only implement a logic
// a developer would implement manually, if necessary.
// Another idea is to make makePatches configurable via custom functions.
export const makePatches = (
  previousRows: ReadonlyArray<Row> | undefined,
  nextRows: ReadonlyArray<Row>,
): readonly Patch[] => {
  if (previousRows === undefined)
    return [{ op: "replaceAll", value: nextRows }];
  // TODO: Detect prepend and append, it's cheap.
  if (previousRows.length !== nextRows.length) {
    return [{ op: "replaceAll", value: nextRows }];
  }

  const length = previousRows.length;
  const replaceAtPatches: ReplaceAtPatch[] = [];

  for (let i = 0; i < length; i++) {
    const previousRow = previousRows[i];
    const nextRow = nextRows[i];

    // We expect the same shape for both rows.
    for (const key in previousRow)
      if (!areEqual(previousRow[key], nextRow[key])) {
        replaceAtPatches.push({ op: "replaceAt", value: nextRow, index: i });
        break;
      }
  }

  if (length > 0 && replaceAtPatches.length === length) {
    return [{ op: "replaceAll", value: nextRows }];
  }
  return replaceAtPatches;
};

export const areEqual = (
  a: Value | Row | ReadonlyArray<Row>,
  b: Value | Row | ReadonlyArray<Row>,
): boolean => {
  // Compare string, number, null ASAP.
  if (a === b) return true;
  // Different type works only for string and number, everything else is an object.
  if (typeof a !== typeof b) return false;
  // Both are nonnullable objects.
  if (typeof a === "object" && a !== null && b !== null) {
    const aIsUint8Array = Predicate.isUint8Array(a);
    const bIsUint8Array = Predicate.isUint8Array(b);
    if (aIsUint8Array && bIsUint8Array) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }

    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (aIsArray && bIsArray) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++)
        if (!areEqual(a[i] as never, b[i] as never)) return false;
      return true;
    }

    if (!aIsUint8Array && !bIsUint8Array && !aIsArray && !bIsArray) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys)
        if (!areEqual((a as never)[key], (b as never)[key])) return false;
      return true;
    }
  }
  return false;
};
