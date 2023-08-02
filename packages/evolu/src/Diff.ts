import { Query, Row } from "./Db.js";

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

// For now, we detect only a change in the whole result and in-place edits.
// In the future, we will add more heuristics. We will probably not implement
// the Myers diff algorithm because it's faster to rerender all than
// to compute many detailed patches. We will only implement a logic
// a developer would implement manually, if necessary.
export const createPatches = (
  previous: ReadonlyArray<Row> | undefined,
  next: ReadonlyArray<Row>
): readonly Patch[] => {
  if (previous === undefined) return [{ op: "replaceAll", value: next }];
  if (previous.length === 0 && next.length === 0) return [];
  if (previous.length !== next.length)
    return [{ op: "replaceAll", value: next }];

  const replaceAtOps: ReplaceAtPatch[] = [];

  for (let i = 0; i < previous.length; i++) {
    const pItem = previous[i];
    const nItem = next[i];
    for (const key in pItem) {
      if (pItem[key] !== nItem[key]) {
        replaceAtOps.push({ op: "replaceAt", value: nItem, index: i });
        break;
      }
    }
  }

  if (replaceAtOps.length === 0) return [];
  if (replaceAtOps.length === previous.length)
    return [{ op: "replaceAll", value: next }];

  return replaceAtOps;
};
