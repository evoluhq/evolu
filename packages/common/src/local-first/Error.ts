import { DecryptWithXChaCha20Poly1305Error } from "../Crypto.js";
import { UnknownError } from "../Error.js";
import { SqliteError } from "../Sqlite.js";
import { ProtocolError } from "./Protocol.js";
import { TimestampError } from "./Timestamp.js";

/** Represents errors that can occur in Evolu. */
export type EvoluError =
  | DecryptWithXChaCha20Poly1305Error
  | ProtocolError
  | SqliteError
  | TimestampError
  | UnknownError;
