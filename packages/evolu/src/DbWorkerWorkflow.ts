import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import { apply, constVoid, flow, pipe } from "@effect/data/Function";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import * as Ref from "@effect/io/Ref";
import { transaction } from "./Db.js";
import { lazyInitOwner, resetOwner } from "./Owner.js";
import { query } from "./Query.js";
import { updateSchema } from "./Schema.js";
import {
  CreateDbWorker,
  Db,
  DbWorker,
  DbWorkerInput,
  DbWorkerOnMessage,
  DbWorkerRowsCache,
  EvoluError,
  SyncWorkerOutput,
} from "./Types.js";
import { unknownError } from "./UnknownError.js";

export const create =
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

    const recoverFromAllCause: <A>(
      a: A
    ) => (self: Cause.Cause<EvoluError>) => Effect.Effect<never, never, A> = (
      a
    ) =>
      flow(
        Cause.failureOrCause,
        Either.match(
          handleError,
          flow(Cause.squash, unknownError, handleError)
        ),
        () => Effect.succeed(a)
      );

    const syncWorker = new Worker(new URL("./Sync.worker.js", import.meta.url));

    return pipe(
      Effect.gen(function* ($) {
        const db = yield* $(createDb);
        const owner = yield* $(Effect.provideService(lazyInitOwner(), Db, db));

        onMessage({ _tag: "onOwner", owner });

        const context = pipe(
          Context.empty(),
          Context.add(Db, db),
          Context.add(DbWorkerOnMessage, onMessage),
          Context.add(DbWorkerRowsCache, Ref.unsafeMake(new Map()))
        );

        let post: DbWorker["post"] | null = null;

        return (message: DbWorkerInput) => {
          if (post) {
            post(message);
            return;
          }

          const write: (input: DbWorkerInput) => Promise<void> = flow(
            (input) => {
              if (skipAllBecauseBrowserIsGoingToBeReloaded)
                return Effect.succeed(undefined);
              switch (input._tag) {
                case "init":
                  throw new self.Error("init must be called once");
                case "updateSchema":
                  return updateSchema(input.tableDefinitions);
                case "send":
                  // return send(input);
                  return Effect.succeed(undefined);
                case "query":
                  return query(input);
                case "receive":
                  // return receive(input);
                  return Effect.succeed(undefined);
                case "sync":
                  // return sync(input.queries);
                  return Effect.succeed(undefined);
                case "reset":
                  return resetOwner(input.mnemonic);
              }
            },
            flow(
              transaction, // fix prettier
              Effect.catchAllCause(recoverFromAllCause(undefined)),
              Effect.provideContext(context),
              Effect.runPromise
            )
          );

          const stream = new WritableStream<DbWorkerInput>({ write });

          post = (message): void => {
            const writer = stream.getWriter();
            writer.write(message);
            writer.releaseLock();
          };

          syncWorker.onmessage = ({
            data: message,
          }: MessageEvent<SyncWorkerOutput>): void => {
            if (message._tag === "UnknownError") handleError(message);
            else post && post(message);
          };

          if (message._tag !== "init")
            throw new self.Error("init must be called first");

          post({
            _tag: "updateSchema",
            tableDefinitions: message.tableDefinitions,
          });
        };
      }),
      Effect.catchAllCause(recoverFromAllCause(constVoid)),
      Effect.runPromise,
      (post) => ({
        post: (message): void => {
          post.then(apply(message));
        },
      })
    );
  };
