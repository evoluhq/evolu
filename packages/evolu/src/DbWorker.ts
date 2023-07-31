import {
  Brand,
  Cause,
  Context,
  Effect,
  Either,
  Function,
  Layer,
  Match,
  ReadonlyArray,
} from "effect";
import { Config, ConfigLive } from "./Config.js";
import { HmacLive, Bip39Live, Sha512Live } from "./CryptoLive.web.js";
import { Db, Query, Row, Value, init, transaction } from "./Db.js";
import { EvoluError, makeUnexpectedError } from "./Errors.js";
import { MerkleTree } from "./MerkleTree.js";
import { Mnemonic } from "./Mnemonic.js";
import { Id } from "./Model.js";
import { Owner } from "./Owner.js";
import { SyncState } from "./SyncState.js";
import { TimestampString } from "./Timestamp.js";
import { runPromise } from "./run.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  readonly onMessage: (callback: (output: DbWorkerOutput) => void) => void;
}

export const DbWorker = Context.Tag<DbWorker>();

export type DbWorkerInput =
  | {
      readonly _tag: "init";
      readonly config: Config;
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

type OnMessageCallback = Parameters<DbWorker["onMessage"]>[0];
const OnMessageCallback = Context.Tag<OnMessageCallback>();

const foo: Effect.Effect<Db, never, void> = Effect.sync(() => {
  return undefined;
});

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.map(Db, (db) => {
    let onMessageCallback: OnMessageCallback = Function.constVoid;

    const handleError = (error: EvoluError): void => {
      onMessageCallback({ _tag: "onError", error });
    };

    const DbLive = Layer.succeed(Db, db);

    const run: <E extends EvoluError>(
      effect: Effect.Effect<never, E, void>
    ) => Promise<void> = (effect) =>
      effect.pipe(
        transaction,
        Effect.provideLayer(DbLive),
        Effect.catchAllCause((cause) =>
          Cause.failureOrCause(cause).pipe(
            Either.match({
              onLeft: handleError,
              onRight: (cause) => {
                handleError(makeUnexpectedError(Cause.squash(cause)));
              },
            }),
            () => Effect.succeed(undefined)
          )
        ),
        runPromise
      );

    const makeWriteAfterInit =
      (config: Config, owner: Owner) =>
      (input: DbWorkerInput): Promise<void> =>
        Match.value(input).pipe(
          Match.tagsExhaustive({
            init: () => Effect.succeed(undefined),
            query: () => foo,
            receiveMessages: () => foo,
            reset: () => foo,
            sendMessages: () => foo,
            sync: () => foo,
          }),
          Effect.provideLayer(
            Layer.mergeAll(
              DbLive,
              ConfigLive(config),
              Layer.succeed(Owner, Owner.of(owner)),
              Layer.succeed(OnMessageCallback, onMessageCallback)
            )
          ),
          run
        );

    let write = (input: DbWorkerInput): Promise<void> => {
      if (input._tag !== "init") return Promise.resolve(undefined);

      return init().pipe(
        Effect.map((owner) => {
          write = makeWriteAfterInit(input.config, owner);
        }),
        Effect.provideLayer(
          Layer.mergeAll(DbLive, Bip39Live, HmacLive, Sha512Live)
        ),
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
