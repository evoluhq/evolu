import { Brand, Context, Effect, Layer, ReadonlyArray } from "effect";
import { Config } from "./Config.js";
import { Db, Query, Row, Value } from "./Db.js";

import { EvoluError } from "./EvoluError.js";
import { Id } from "./Id.js";
import { MerkleTree } from "./MerkleTree.js";
import { Mnemonic } from "./Mnemonic.js";
import { Owner } from "./Owner.js";
import { TimestampString } from "./Timestamp.js";
import { SyncState } from "./SyncState.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  readonly onMessage: (callback: (output: DbWorkerOutput) => void) => void;
}

export const DbWorker = Context.Tag<DbWorker>();

export type DbWorkerInput =
  | {
      readonly _tag: "init";
      readonly config: Config;
      readonly tableDefinitions: ReadonlyArray<TableDefinition>;
    }
  | {
      readonly _tag: "updateSchema";
      readonly tableDefinitions: ReadonlyArray<TableDefinition>;
    }
  | {
      readonly _tag: "sendMessages";
      readonly newMessages: ReadonlyArray.NonEmptyReadonlyArray<NewMessage>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
      readonly queries: ReadonlyArray<Query>;
    }
  | {
      readonly _tag: "query";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query>;
    }
  | {
      readonly _tag: "sync";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query> | null;
    }
  | {
      readonly _tag: "reset";
      readonly mnemonic?: Mnemonic;
    }
  | DbWorkerInputReceiveMessages;

export interface TableDefinition {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

export type DbWorkerInputReceiveMessages = {
  readonly _tag: "receiveMessages";
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
  readonly syncCount: number;
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
  | { readonly _tag: "onResetOrRestore" }
  | { readonly _tag: "onSyncState"; readonly state: SyncState };

export interface QueryPatches {
  readonly query: Query;
  readonly patches: ReadonlyArray<Patch>;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: ReadonlyArray<Row>;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Row;
}

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.map(Db, (_db) => {
    const postMessage: DbWorker["postMessage"] = (_input) => {
      // tady mi chodej messages, handluju, jasny
      // pustim effect, kterej cpu do streamu, jak jsem mel, cajk
      // kazdej effect muze zavolat onMessage
      // imho jak jsem mel, to bylo ok
    };

    const onMessage: DbWorker["onMessage"] = (_callback) => {
      // ulozim callback, ten pak volam, jasny
      // cokoliv muze nastavit, na to to posilam, jasny
      // poradi je fuk
    };

    return { postMessage, onMessage };
  })
);
