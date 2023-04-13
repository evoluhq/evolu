import * as Timestamp from "./Timestamp.js";

export type Error =
  | Timestamp.TimestampDuplicateNodeError
  | Timestamp.TimestampDriftError
  | Timestamp.TimestampCounterOverflowError
  | Timestamp.TimestampParseError;
// | UnknownError
// | SyncError;

export interface EvoluError {
  readonly _tag: "EvoluError";
  readonly error: Error;
}
