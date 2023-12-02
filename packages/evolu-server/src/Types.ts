import { MerkleTreeString, OwnerId, TimestampString } from "@evolu/common";
import { Context } from "effect";
import { Kysely } from "kysely";

/** Evolu Server database schema. */
export interface Database {
  readonly message: MessageTable;
  readonly merkleTree: MerkleTreeTable;
}

interface MessageTable {
  readonly timestamp: TimestampString;
  readonly userId: OwnerId;
  readonly content: Uint8Array;
}

interface MerkleTreeTable {
  readonly userId: OwnerId;
  readonly merkleTree: MerkleTreeString;
}

/**
 * Evolu Server Kysely instance. Use only PostgreSQL or SQLite dialects for now.
 * https://kysely-org.github.io/kysely-apidoc/classes/InsertQueryBuilder.html#onConflict
 */
export type Db = Kysely<Database>;
export const Db = Context.Tag<Db>();

export interface BadRequestError {
  readonly _tag: "BadRequestError";
  readonly error: unknown;
}
