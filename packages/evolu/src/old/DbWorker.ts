import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import { apply, constVoid, pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import * as Ref from "@effect/io/Ref";
import { readClock } from "./Clock.js";
import { transaction } from "./Db.js";
import { receiveMessages, sendMessages } from "./Messages.js";
import { lazyInitOwner, resetOwner } from "./Owner.js";
import { query } from "./Query.js";
import { updateSchema } from "./Schema.js";
import {
  Config,
  CreateDbWorker,
  Db,
  DbWorker,
  DbWorkerInput,
  DbWorkerOnMessage,
  DbWorkerRowsCache,
  EvoluError,
  Millis,
  Owner,
  Query,
  SyncWorkerOutput,
  SyncWorkerPost,
  Time,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampDuplicateNodeError,
} from "./Types.js";
import { unknownError } from "./UnknownError.js";
import { InitialTimestamp, InitialTimestampLive } from "./Timestamp.js";

const sync = (
  queries: ReadonlyArray.NonEmptyReadonlyArray<Query> | null
): Effect.Effect<
  Db | Owner | SyncWorkerPost | DbWorkerRowsCache | DbWorkerOnMessage | Config,
  never,
  void
> =>
  Effect.gen(function* ($) {
    if (queries != null) yield* $(query({ queries }));
    const [clock, syncWorkerPost, config, owner] = yield* $(
      Effect.all([readClock, SyncWorkerPost, Config, Owner])
    );
    syncWorkerPost({
      _tag: "sync",
      syncUrl: config.syncUrl,
      clock,
      owner,
      messages: ReadonlyArray.empty(),
      syncCount: 0,
    });
  });

export const createCreateDbWorker =
  (createDb: Effect.Effect<never, never, Db>): CreateDbWorker =>
  (_onMessage) => {
    let skipAllBecauseBrowserIsGoingToBeReloaded = false;

    const onMessage: DbWorkerOnMessage = (message) => {
      if (message._tag === "onResetOrRestore")
        skipAllBecauseBrowserIsGoingToBeReloaded = true;
      _onMessage(message);
    };

    const handleError = (error: EvoluError): void =>
      onMessage({ _tag: "onError", error });

    const recoverFromAllCause =
      <A>(a: A) =>
      (cause: Cause.Cause<EvoluError>): Effect.Effect<never, never, A> =>
        pipe(
          Cause.failureOrCause(cause),
          Either.match({
            onLeft: handleError,
            onRight: (cause) =>
              pipe(Cause.squash(cause), unknownError, handleError),
          }),
          () => Effect.succeed(a)
        );

    const syncWorker = new Worker(new URL("Sync.worker.js", import.meta.url), {
      type: "module",
    });
    const syncWorkerPost: SyncWorkerPost = (message) => {
      syncWorker.postMessage(message);
    };

    return pipe(
      Effect.gen(function* ($) {
        const db = yield* $(createDb);
        const owner = yield* $(
          lazyInitOwner(),
          transaction,
          Effect.provideService(Db, db)
        );

        onMessage({ _tag: "onOwner", owner });

        const context = pipe(
          Context.empty(),
          Context.add(Db, db),
          Context.add(DbWorkerOnMessage, onMessage),
          Context.add(DbWorkerRowsCache, Ref.unsafeMake(new Map())),
          Context.add(Owner, owner),
          Context.add(SyncWorkerPost, syncWorkerPost),
          Context.add(Time, { now: () => Date.now() as Millis })
        );

        let post: DbWorker["post"] | null = null;

        return (message: DbWorkerInput) => {
          if (post) {
            post(message);
            return;
          }

          if (message._tag !== "init")
            throw new self.Error("init must be called first");

          const inputToEffect = (
            input: DbWorkerInput
          ): Effect.Effect<
            | Db
            | Owner
            | DbWorkerOnMessage
            | DbWorkerRowsCache
            | SyncWorkerPost
            | Time
            | Config
            | InitialTimestamp,
            | TimestampDuplicateNodeError
            | TimestampDriftError
            | TimestampCounterOverflowError,
            void
          > => {
            if (skipAllBecauseBrowserIsGoingToBeReloaded)
              return Effect.succeed(undefined);
            switch (input._tag) {
              case "init":
                throw new self.Error("init must be called once");
              case "updateSchema":
                return updateSchema(input.tableDefinitions);
              case "sendMessages":
                return sendMessages(input);
              case "query":
                return query(input);
              case "receiveMessages":
                return receiveMessages(input);
              case "sync":
                return sync(input.queries);
              case "reset":
                return resetOwner(input.mnemonic);
            }
          };

          const contextWithConfig = pipe(
            context,
            Context.add(Config, message.config)
          );

          const write = (input: DbWorkerInput): Promise<void> =>
            pipe(
              inputToEffect(input),
              transaction,
              Effect.catchAllCause(recoverFromAllCause(undefined)),
              Effect.provideSomeLayer(InitialTimestampLive),
              Effect.provideContext(contextWithConfig),
              Effect.runPromise
            );

          const stream = new WritableStream<DbWorkerInput>({ write });

          post = (message): void => {
            const writer = stream.getWriter();
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            writer.write(message);
            writer.releaseLock();
          };

          syncWorker.onmessage = ({
            data: message,
          }: MessageEvent<SyncWorkerOutput>): void => {
            switch (message._tag) {
              case "UnknownError":
                handleError(message);
                break;
              case "receiveMessages":
                if (post) post(message);
                break;
              default:
                onMessage({ _tag: "onSyncState", state: message });
            }
          };

          post({
            _tag: "updateSchema",
            tableDefinitions: message.tableDefinitions,
          });
        };
      }),
      Effect.catchAllCause(recoverFromAllCause(constVoid)),
      Effect.provideLayer(InitialTimestampLive),
      Effect.runPromise,
      (post) => ({
        post: (message): void => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          post.then(apply(message));
        },
      })
    );
  };
