import * as SyncWorker from "./Sync.worker.js";
import * as Timestamp from "./Timestamp.js";
import * as UnknownError from "./UnknownError.js";

export type Error =
  | Timestamp.TimestampDuplicateNodeError
  | Timestamp.TimestampDriftError
  | Timestamp.TimestampCounterOverflowError
  | Timestamp.TimestampParseError
  | UnknownError.UnknownError
  | SyncWorker.SyncError;

export interface EvoluError {
  readonly _tag: "EvoluError";
  readonly error: Error;
}
