import * as Model from "./Model.js";
import * as Timestamp from "./Timestamp.js";

export interface NewMessage {
  readonly table: string;
  readonly row: Model.Id;
  readonly column: string;
  //   readonly value: CrdtValue;
}

export interface Message extends NewMessage {
  readonly timestamp: Timestamp.TimestampString;
}

// TODO: send, receive, etc.
