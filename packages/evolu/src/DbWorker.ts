import * as Brand from "@effect/data/Brand";
import * as Either from "@effect/data/Either";
import { apply, constVoid, flow, pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Cause from "@effect/io/Cause";
import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";
import * as Config from "./Config.js";
import * as Db from "./Db.js";
import * as Diff from "./Diff.js";
import * as Error from "./Error.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Message from "./Message.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";
import * as SyncWorker from "./Sync.worker.js";
import * as Timestamp from "./Timestamp.js";
import * as UnknownError from "./UnknownError.js";

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

export type OnComplete = () => void;

export type Input =
  | {
      readonly _tag: "init";
      readonly config: Config.Config;
      readonly tableDefinitions: Schema.TablesDefinitions;
    }
  | {
      readonly _tag: "updateSchema";
      readonly tableDefinitions: Schema.TablesDefinitions;
    }
  | {
      readonly _tag: "send";
      readonly messages: ReadonlyArray.NonEmptyReadonlyArray<Message.NewMessage>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
      readonly queries: ReadonlyArray<Db.QueryString>;
    }
  | {
      readonly _tag: "query";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Db.QueryString>;
    }
  | {
      readonly _tag: "receive";
      readonly messages: ReadonlyArray<Message.Message>;
      readonly merkleTree: MerkleTree.MerkleTree;
      readonly previousDiff: Timestamp.Millis | null;
    }
  | {
      readonly _tag: "sync";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Db.QueryString> | null;
    }
  | {
      readonly _tag: "resetOwner";
    }
  | {
      readonly _tag: "restoreOwner";
      readonly mnemonic: Mnemonic.Mnemonic;
    };

export type Output =
  | { readonly _tag: "onError"; readonly error: Error.Error }
  | { readonly _tag: "onOwner"; readonly owner: Owner.Owner }
  | {
      readonly _tag: "onQuery";
      readonly queriesPatches: ReadonlyArray<Diff.QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
    }
  | { readonly _tag: "onReceive" }
  | { readonly _tag: "onResetOrRestore" };

export interface DbWorker {
  readonly post: (message: Input) => void;
}

export type CreateDbWorker = (onMessage: (message: Output) => void) => DbWorker;

type PostInput = (message: Input) => void;

export const createCreateDbWorker =
  (createDb: Effect.Effect<never, never, Db.Db>): CreateDbWorker =>
  (onMessage) => {
    let skipAllBecauseBrowserIsGoingToBeReloaded = false;

    const postOutput = (message: Output): void => {
      if (message._tag === "onResetOrRestore")
        skipAllBecauseBrowserIsGoingToBeReloaded = true;
      onMessage(message);
    };

    const handleError = (error: Error.Error): void =>
      postOutput({ _tag: "onError", error });

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
        const owner = yield* $(Effect.provideService(Db.init(), Db.Db, db));
        postOutput({ _tag: "onOwner", owner });

        const context = pipe(
          Context.empty(),
          Context.add(Db.Db, db)
          // Context.add(FooTag)({ foo: 'foo' })
        );

        let postInput: PostInput | null = null;

        return (message: Input) => {
          if (postInput) {
            postInput(message);
            return;
          }

          const write: (input: Input) => Promise<void> = flow(
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
                  // return query(input);
                  return Effect.succeed(undefined);
                case "receive":
                  // return receive(input);
                  return Effect.succeed(undefined);
                case "sync":
                  // return sync(input.queries);
                  return Effect.succeed(undefined);
                case "resetOwner":
                  // return resetOwner;
                  return Effect.succeed(undefined);
                case "restoreOwner":
                  // return restoreOwner(input.mnemonic);
                  return Effect.succeed(undefined);
              }
            },
            flow(
              Db.transaction, // fix prettier
              Effect.catchAllCause(recoverFromAllCause(undefined)),
              Effect.provideContext(context),
              Effect.runPromise
            )
          );

          const stream = new WritableStream<Input>({ write });

          postInput = (message): void => {
            const writer = stream.getWriter();
            writer.write(message);
            writer.releaseLock();
          };

          syncWorker.onmessage = ({
            data: message,
          }: MessageEvent<SyncWorker.Output>): void => {
            if (message._tag === "UnknownError") handleError(message);
            else postInput && postInput(message);
          };

          if (message._tag !== "init")
            throw new self.Error("init must be called first");

          postInput({
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
