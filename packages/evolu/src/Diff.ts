import { Query, Row } from "./Sqlite.js";

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
    patches.reduce((a, patch) => {
      switch (patch.op) {
        case "replaceAll":
          return patch.value;
        case "replaceAt": {
          if (a === undefined) return a;
          const next = [...a];
          next[patch.index] = patch.value;
          return next;
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
  previousRows: ReadonlyArray<Row>,
  nextRows: ReadonlyArray<Row>,
): readonly Patch[] => {
  // TODO: Detect prepend and append, it's cheap.
  if (previousRows.length !== nextRows.length)
    return [{ op: "replaceAll", value: nextRows }];

  const length = previousRows.length;
  const replaceAtPatches: ReplaceAtPatch[] = [];

  for (let i = 0; i < length; i++) {
    const previousRow = previousRows[i];
    const nextRow = nextRows[i];
    // We expect the same shape for both rows.
    for (const key in previousRow)
      if (previousRow[key] !== nextRow[key]) {
        replaceAtPatches.push({ op: "replaceAt", value: nextRow, index: i });
        break;
      }
  }

  if (length > 0 && replaceAtPatches.length === length)
    return [{ op: "replaceAll", value: nextRows }];
  return replaceAtPatches;
};
