import {
  Cause,
  Context,
  Effect,
  Either,
  Function,
  Layer,
  ReadonlyArray,
  Ref,
} from "effect";
import { Config } from "./Config.js";
import { Mnemonic } from "./Crypto.js";
import {
  DbInit,
  Owner,
  Query,
  Table,
  queryObjectFromQuery,
  transaction,
} from "./Db.js";
import { QueryPatches, createPatches } from "./Diff.js";
import { EvoluError, makeUnexpectedError } from "./Errors.js";
import { MerkleTree } from "./MerkleTree.js";
import { Id } from "./Model.js";
import { OnCompleteId } from "./OnCompletes.js";
import { RowsCacheRef } from "./RowsCache.js";
import { Sqlite, Value } from "./Sqlite.js";
import { SyncState } from "./SyncState.js";
import { TimestampString } from "./Timestamp.js";
import { runPromise } from "./run.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  readonly onMessage: (callback: (output: DbWorkerOutput) => void) => void;
}

export const DbWorker = Context.Tag<DbWorker>("evolu/DbWorker");

export type DbWorkerInput =
  | {
      readonly _tag: "init";
      readonly config: Config;
      readonly tables: ReadonlyArray<Table>;
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

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

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

type OnMessageCallback = Parameters<DbWorker["onMessage"]>[0];
const OnMessageCallback = Context.Tag<OnMessageCallback>(
  "evolu/OnMessageCallback"
);

// TODO: Do Db
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const query = ({
  queries,
  onCompleteIds = ReadonlyArray.empty(),
}: {
  readonly queries: ReadonlyArray<Query>;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<Sqlite | OnMessageCallback | RowsCacheRef, never, void> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    const queriesRows = yield* _(
      Effect.forEach(queries, (query) =>
        sqlite
          .exec(queryObjectFromQuery(query))
          .pipe(Effect.map((rows) => [query, rows] as const))
      )
    );

    const rowsCache = yield* _(RowsCacheRef);
    const previous = yield* _(Ref.get(rowsCache));
    yield* _(Ref.set(rowsCache, new Map([...previous, ...queriesRows])));

    const queriesPatches = queriesRows.map(
      ([query, rows]): QueryPatches => ({
        query,
        patches: createPatches(previous.get(query), rows),
      })
    );

    const onMessageCallback = yield* _(OnMessageCallback);
    onMessageCallback({ _tag: "onQuery", queriesPatches, onCompleteIds });
  });

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const dbInit = yield* _(DbInit);

    let onMessageCallback: OnMessageCallback = Function.constVoid;

    const handleError = (error: EvoluError): void => {
      onMessageCallback({ _tag: "onError", error });
    };

    const run: <E extends EvoluError>(
      effect: Effect.Effect<never, E, void>
    ) => Promise<void> = (effect) =>
      effect.pipe(
        transaction,
        Effect.provideService(Sqlite, sqlite),
        Effect.catchAllCause((cause) =>
          Cause.failureOrCause(cause).pipe(
            Either.match({
              onLeft: handleError,
              onRight: (cause) =>
                handleError(makeUnexpectedError(Cause.squash(cause))),
            }),
            () => Effect.succeed(undefined)
          )
        ),
        runPromise
      );

    // const makeWriteAfterInit =
    //   (config: Config, owner: Owner) =>
    //   (input: DbWorkerInput): Promise<void> =>
    //     Match.value(input).pipe(
    //       Match.tagsExhaustive({
    //         init: () => {
    //           throw new self.Error("Init must be called once.");
    //         },
    //         query,
    //         receiveMessages: () => foo,
    //         reset: () => foo,
    //         sendMessages: () => foo,
    //         sync: () => foo,
    //       }),
    //       Effect.provideLayer(
    //         Layer.mergeAll(
    //           SqliteLive,
    //           ConfigLive(config),
    //           Layer.succeed(Owner, owner),
    //           Layer.succeed(OnMessageCallback, onMessageCallback),
    //           RowsCacheRefLive
    //         )
    //       ),
    //       run
    //     );

    const makeWriteAfterInit = ({ owner }: { readonly owner: Owner }) => {
      return (_input: DbWorkerInput): Promise<void> => {
        return Promise.resolve(undefined);
      };
    };

    let write = (input: DbWorkerInput): Promise<void> => {
      if (input._tag !== "init")
        throw new self.Error("Init must be called first.");

      return dbInit(input).pipe(
        Effect.map(({ owner }) => {
          onMessageCallback({ _tag: "onOwner", owner });
          write = makeWriteAfterInit({ owner });
        }),
        run
      );
    };

    const stream = new WritableStream<DbWorkerInput>({
      write: (input): Promise<void> => write(input),
    });

    const postMessage: DbWorker["postMessage"] = (input) => {
      const writer = stream.getWriter();
      void writer.write(input);
      writer.releaseLock();
    };

    const onMessage: DbWorker["onMessage"] = (callback) => {
      onMessageCallback = callback;
    };

    return { postMessage, onMessage };
  })
);
