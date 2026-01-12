import type { DecryptWithXChaCha20Poly1305Error } from "../Crypto.js";
import type { UnknownError } from "../Error.js";
import type { SqliteError } from "../Sqlite.js";
import type { ProtocolError } from "./Protocol.js";
import type { TimestampError } from "./Timestamp.js";

/** Represents errors that can occur in Evolu. */
export type EvoluError =
  | DecryptWithXChaCha20Poly1305Error
  | ProtocolError
  | SqliteError
  | TimestampError
  | UnknownError;
