import * as Query from "./Query.js";
import * as Schema from "./Schema.js";

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: Schema.Rows;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Schema.Row;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface QueryPatches {
  readonly query: Query.QueryString;
  readonly patches: ReadonlyArray<Patch>;
}
