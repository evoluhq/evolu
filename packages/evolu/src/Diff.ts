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
