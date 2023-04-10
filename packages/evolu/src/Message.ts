import * as Model from "./Model.js";

export interface NewCrdtMessage {
  readonly table: string;
  readonly row: Model.Id;
  readonly column: string;
  //   readonly value: CrdtValue;
}

// export interface CrdtMessage extends NewCrdtMessage {
//   readonly timestamp: TimestampString;
// }

// TODO: send, receive, etc.
