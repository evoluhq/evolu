import * as Db from "./Db.js";

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: Db.Rows;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Db.Row;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface QueryPatches {
  readonly query: Db.QueryString;
  readonly patches: ReadonlyArray<Patch>;
}

export const applyPatches =
  (patches: ReadonlyArray<Patch>) =>
  (current: Db.Rows): Db.Rows =>
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
