/**
 * Evolu error types.
 *
 * @module
 */

import type { DecryptWithXChaCha20Poly1305Error } from "../Crypto.ts";
import type { UnknownError } from "../Error.ts";
import type { ProtocolError } from "./Protocol.ts";
import type { TimestampError } from "./Timestamp.ts";

/** Represents errors that can occur in Evolu. */
export type EvoluError =
  | DecryptWithXChaCha20Poly1305Error
  | ProtocolError
  | TimestampError
  | UnknownError;
