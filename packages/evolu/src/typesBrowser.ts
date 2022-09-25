import { Either } from "fp-ts/Either";
import { IO } from "fp-ts/IO";
import { TaskEither } from "fp-ts/TaskEither";
import { Option } from "fp-ts/Option";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { Mnemonic } from "./model.js";
import {
  Config,
  CrdtClock,
  CrdtMessage,
  Database,
  EvoluError,
  MerkleTree,
  Millis,
  NewCrdtMessage,
  Owner,
  QueryPatches,
  SqlQueryString,
  TableDefinition,
  UnknownError,
} from "./types.js";

// Workers.

export type DbWorkerInputInit = {
  readonly type: "init";
  readonly config: Config;
  readonly syncPort: MessagePort;
};

export type DbWorkerInput =
  | {
      readonly type: "updateDbSchema";
      readonly tableDefinitions: readonly TableDefinition[];
    }
  | {
      readonly type: "send";
      readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
      readonly queries: readonly SqlQueryString[];
    }
  | {
      readonly type: "query";
      readonly queries: ReadonlyNonEmptyArray<SqlQueryString>;
    }
  | {
      readonly type: "receive";
      readonly messages: readonly CrdtMessage[];
      readonly merkleTree: MerkleTree;
      readonly previousDiff: Option<Millis>;
    }
  | {
      readonly type: "sync";
      readonly queries: Option<ReadonlyNonEmptyArray<SqlQueryString>>;
    }
  | {
      readonly type: "resetOwner";
    }
  | {
      readonly type: "restoreOwner";
      readonly mnemonic: Mnemonic;
    };

export type DbWorkerOutput =
  | {
      readonly type: "onError";
      readonly error: EvoluError["error"];
    }
  | {
      readonly type: "onInit";
      readonly owner: Owner;
    }
  | {
      readonly type: "onQuery";
      readonly queriesPatches: ReadonlyNonEmptyArray<QueryPatches>;
    }
  | {
      readonly type: "onReceive";
    }
  | { readonly type: "reloadAllTabs" };

export type SyncWorkerInputInit = {
  readonly type: "init";
  readonly config: Config;
  readonly syncPort: MessagePort;
};

export type SyncWorkerInput = {
  readonly type: "sync";
  readonly messages: Option<ReadonlyNonEmptyArray<CrdtMessage>>;
  readonly clock: CrdtClock;
  readonly owner: Owner;
  readonly previousDiff: Option<Millis>;
};

export type SyncWorkerOutput = Either<
  UnknownError,
  {
    readonly messages: readonly CrdtMessage[];
    readonly merkleTree: MerkleTree;
    readonly previousDiff: Option<Millis>;
  }
>;

// Environments.
// https://andywhite.xyz/posts/2021-01-28-rte-react/

export interface DbEnv {
  readonly db: Database;
}

export interface DbTransactionEnv {
  readonly dbTransaction: <E, A>(
    te: TaskEither<E, A>
  ) => TaskEither<E | UnknownError, A>;
}

export interface OwnerEnv {
  readonly owner: Owner;
}

export interface PostDbWorkerOutputEnv {
  readonly postDbWorkerOutput: (message: DbWorkerOutput) => IO<void>;
}

export interface PostSyncWorkerInputEnv {
  readonly postSyncWorkerInput: (message: SyncWorkerInput) => IO<void>;
}
