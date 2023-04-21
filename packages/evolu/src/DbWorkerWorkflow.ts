import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import { apply, constVoid, flow, pipe } from "@effect/data/Function";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import * as Ref from "@effect/io/Ref";
import * as Db from "./Db.js";
import * as DbWorker from "./DbWorker.js";
import * as Error from "./Error.js";
import * as Owner from "./Owner.js";
import * as Query from "./Query.js";
import * as Schema from "./Schema.js";
import * as SyncWorker from "./Sync.worker.js";
import * as UnknownError from "./UnknownError.js";

export const create =
  (createDb: Effect.Effect<never, never, Db.Db>): DbWorker.CreateDbWorker =>
  (_onMessage) => {
    let skipAllBecauseBrowserIsGoingToBeReloaded = false;

    const onMessage: DbWorker.OnMessage = (message) => {
      if (message._tag === "onResetOrRestore")
        skipAllBecauseBrowserIsGoingToBeReloaded = true;
      _onMessage(message);
    };

    const handleError = (error: Error.Error): void =>
      onMessage({ _tag: "onError", error });

    const recoverFromAllCause: <A>(
      a: A
    ) => (self: Cause.Cause<Error.Error>) => Effect.Effect<never, never, A> = (
      a
    ) =>
      flow(
        Cause.failureOrCause,
        Either.match(
          handleError,
          flow(Cause.squash, UnknownError.unknownError, handleError)
        ),
        () => Effect.succeed(a)
      );

    const syncWorker = new Worker(new URL("./Sync.worker.js", import.meta.url));

    return pipe(
      Effect.gen(function* ($) {
        const db = yield* $(createDb);
        const owner = yield* $(
          Effect.provideService(Owner.lazyInit(), Db.Db, db)
        );

        onMessage({ _tag: "onOwner", owner });

        const context = pipe(
          Context.empty(),
          Context.add(Db.Db, db),
          Context.add(DbWorker.OnMessage, onMessage),
          Context.add(DbWorker.RowsCache, Ref.unsafeMake(new Map()))
        );

        let post: DbWorker.Post | null = null;

        return (message: DbWorker.Input) => {
          if (post) {
            post(message);
            return;
          }

          const write: (input: DbWorker.Input) => Promise<void> = flow(
            (input) => {
              if (skipAllBecauseBrowserIsGoingToBeReloaded)
                return Effect.succeed(undefined);
              switch (input._tag) {
                case "init":
                  throw new self.Error("init must be called once");
                case "updateSchema":
                  return Schema.update(input.tableDefinitions);
                case "send":
                  // return send(input);
                  return Effect.succeed(undefined);
                case "query":
                  return Query.query(input);
                case "receive":
                  // return receive(input);
                  return Effect.succeed(undefined);
                case "sync":
                  // return sync(input.queries);
                  return Effect.succeed(undefined);
                case "reset":
                  return Owner.reset(input.mnemonic);
              }
            },
            flow(
              Db.transaction, // fix prettier
              Effect.catchAllCause(recoverFromAllCause(undefined)),
              Effect.provideContext(context),
              Effect.runPromise
            )
          );

          const stream = new WritableStream<DbWorker.Input>({ write });

          post = (message): void => {
            const writer = stream.getWriter();
            writer.write(message);
            writer.releaseLock();
          };

          syncWorker.onmessage = ({
            data: message,
          }: MessageEvent<SyncWorker.Output>): void => {
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
