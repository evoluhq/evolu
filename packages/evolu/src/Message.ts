import { Id } from "./Model.js";
import { Value } from "./Sqlite.js";
import { TimestampString } from "./Timestamp.js";

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}
