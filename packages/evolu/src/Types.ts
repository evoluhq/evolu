import { Brand } from "@effect/data/Brand";
import { Tag } from "@effect/data/Context";
import { Either } from "@effect/data/Either";
import { pipe } from "@effect/data/Function";
import { NonEmptyReadonlyArray } from "@effect/data/ReadonlyArray";
import { ReadonlyRecord } from "@effect/data/ReadonlyRecord";
import { Effect } from "@effect/io/Effect";
import { Ref } from "@effect/io/Ref";
import * as S from "@effect/schema/Schema";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";

export interface Config {
  /**
   * Alternate URL to Evolu sync&backup server.
   */
  syncUrl: string;
  /**
   * Alternate URL to reload browser tabs after `Owner` reset or restore.
   * The default value is `/`.
   */
  reloadUrl: string;
  /**
   * Maximum physical clock drift allowed in ms.
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  maxDrift: number;
}
export const Config = Tag<Config>();

export const NodeId = pipe(
  S.string,
  S.pattern(/^[\w-]{16}$/),
  S.brand("NodeId")
);
export type NodeId = S.To<typeof NodeId>;

export const Millis = pipe(
  S.number,
  S.greaterThanOrEqualTo(0),
  S.brand("Millis")
);
export type Millis = S.To<typeof Millis>;

export const Counter = pipe(S.number, S.between(0, 65535), S.brand("Counter"));
export type Counter = S.To<typeof Counter>;

export interface Timestamp {
  readonly node: NodeId;
  readonly millis: Millis;
  readonly counter: Counter;
}

export type TimestampString = string & Brand<"TimestampString">;

export interface Time {
  readonly now: () => Millis;
}
export const Time = Tag<Time>();

export type TimestampHash = number & Brand<"TimestampHash">;

export interface TimestampDuplicateNodeError {
  readonly _tag: "TimestampDuplicateNodeError";
  readonly node: NodeId;
}

export interface TimestampDriftError {
  readonly _tag: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly _tag: "TimestampCounterOverflowError";
}

export interface TimestampParseError {
  readonly _tag: "TimestampParseError";
}

// TODO: Add Schema and use it in Evolu Server.
export interface MerkleTree {
  readonly hash?: TimestampHash;
  readonly "0"?: MerkleTree;
  readonly "1"?: MerkleTree;
  readonly "2"?: MerkleTree;
}

export type MerkleTreeString = string & Brand<"MerkleTreeString">;

export interface Clock {
  readonly timestamp: Timestamp;
  readonly merkleTree: MerkleTree;
}

/**
 * Mnemonic is a password generated by Evolu in BIP39 format.
 *
 * A mnemonic, also known as a "seed phrase," is a set of 12 words in a
 * specific order chosen from a predefined list. The purpose of the BIP39
 * mnemonic is to provide a human-readable way of storing a private key.
 */
export type Mnemonic = string & Brand<"Mnemonic">;

export interface InvalidMnemonicError {
  readonly _tag: "InvalidMnemonic";
}

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic;
  /** The unique identifier of `Owner` safely derived from its `Mnemonic`. */
  readonly id: Id & Brand<"Owner">;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}
export const Owner = Tag<Owner>();

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

export interface OwnerActions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: () => void;

  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string
  ) => Promise<Either<RestoreOwnerError, void>>;
}

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord<Value>;

export type Rows = ReadonlyArray<Row>;

export interface RowsWithLoadingState {
  readonly rows: Rows;
  readonly isLoading: boolean;
}

export interface TableDefinition {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export type TablesDefinitions = ReadonlyArray<TableDefinition>;

// Like Kysely CompiledQuery but without a `query` prop.
export interface Query {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type QueryString = string & Brand<"QueryString">;

export interface Db {
  readonly exec: (arg: string | Query) => Effect<never, never, Rows>;
  readonly changes: () => Effect<never, never, number>;
}
export const Db = Tag<Db>();

export type RowsCache = ReadonlyMap<QueryString, RowsWithLoadingState>;

export type Schema = ReadonlyRecord<{ id: Id } & Record<string, Value>>;

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: Owner["id"];
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

export type AllowAutoCasting<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
    ? null | boolean | SqliteBoolean
    : T[K] extends SqliteDate
    ? Date | SqliteDate
    : T[K] extends null | SqliteDate
    ? null | Date | SqliteDate
    : T[K];
};

export type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

/**
 * We can't use the whole error because of WebWorker postMessage DataCloneError in Safari and Firefox.
 */
interface TransferableError {
  // https://discord.com/channels/795981131316985866/795983589644304396/1096736473396564079
  readonly message: string;
  readonly stack: string | undefined;
}

/**
 * A kitchen sink error for errors we don't expect to happen.
 */
export interface UnknownError {
  readonly _tag: "UnknownError";
  readonly error: TransferableError;
}

/**
 * The client was unable to get in sync with the server.
 * This error can happen only when MerkleTree has a bug or
 * server did not update itself.
 */
export interface SyncError {
  readonly _tag: "SyncError";
}

export type EvoluError =
  | TimestampDuplicateNodeError
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampParseError
  | UnknownError
  | SyncError;

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: Rows;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Row;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface QueryPatches {
  readonly query: QueryString;
  readonly patches: ReadonlyArray<Patch>;
}

export type OnCompleteId = string & Brand<"Id"> & Brand<"OnComplete">;

export type DbWorkerInput =
  | {
      readonly _tag: "init";
      readonly config: Config;
      readonly tableDefinitions: TablesDefinitions;
    }
  | {
      readonly _tag: "updateSchema";
      readonly tableDefinitions: TablesDefinitions;
    }
  | {
      readonly _tag: "sendMessages";
      readonly newMessages: NonEmptyReadonlyArray<NewMessage>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
      readonly queries: ReadonlyArray<QueryString>;
    }
  | {
      readonly _tag: "query";
      readonly queries: NonEmptyReadonlyArray<QueryString>;
    }
  | {
      readonly _tag: "receiveMessages";
      readonly messages: ReadonlyArray<Message>;
      readonly merkleTree: MerkleTree;
      readonly previousDiff: Millis | null;
    }
  | {
      readonly _tag: "sync";
      readonly queries: NonEmptyReadonlyArray<QueryString> | null;
    }
  | {
      readonly _tag: "reset";
      readonly mnemonic?: Mnemonic;
    };

export type DbWorkerOutput =
  | { readonly _tag: "onError"; readonly error: EvoluError }
  | { readonly _tag: "onOwner"; readonly owner: Owner }
  | {
      readonly _tag: "onQuery";
      readonly queriesPatches: ReadonlyArray<QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
    }
  | { readonly _tag: "onReceive" }
  | { readonly _tag: "onResetOrRestore" };

export type DbWorkerOnMessage = (message: DbWorkerOutput) => void;
export const DbWorkerOnMessage = Tag<DbWorkerOnMessage>();

export interface DbWorker {
  readonly post: (message: DbWorkerInput) => void;
}

export type CreateDbWorker = (
  onMessage: (message: DbWorkerOutput) => void
) => DbWorker;

export type DbWorkerRowsCache = Ref<ReadonlyMap<QueryString, Rows>>;
export const DbWorkerRowsCache = Tag<DbWorkerRowsCache>();

export type SyncWorkerInput = {
  readonly syncUrl: string;
  readonly messages: ReadonlyArray<Message>;
  readonly clock: Clock;
  readonly owner: Owner;
  readonly previousDiff: Millis | null;
};

export type SyncWorkerOutput =
  | UnknownError
  | Extract<DbWorkerInput, { _tag: "receiveMessages" }>;

export type SyncWorkerPost = (message: SyncWorkerInput) => void;
export const SyncWorkerPost = Tag<SyncWorkerPost>();

export type Listener = () => void;

export type Unsubscribe = () => void;

export interface Store<T> {
  readonly subscribe: (listener: Listener) => Unsubscribe;
  readonly setState: (state: T) => void;
  readonly getState: () => T;
}

export type RequestSync = (callback: () => Promise<void>) => void;
export const RequestSync = Tag<RequestSync>();

export type IsSyncing = () => Effect<never, never, boolean>;
export const IsSyncing = Tag<IsSyncing>();
