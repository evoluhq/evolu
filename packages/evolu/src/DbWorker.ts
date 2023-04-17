import * as Brand from "@effect/data/Brand";
import * as Either from "@effect/data/Either";
import { absurd, constVoid, flow, pipe } from "@effect/data/Function";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as Cause from "@effect/io/Cause";
import * as Config from "./Config.js";
import * as UnknownError from "./UnknownError.js";
import * as Db from "./Db.js";
import * as Diff from "./Diff.js";
import * as Error from "./Error.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Message from "./Message.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";
import * as Timestamp from "./Timestamp.js";

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
      readonly _tag: "updateDbSchema";
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

export const createCreateDbWorker =
  (createDb: Effect.Effect<never, never, Db.Db>): CreateDbWorker =>
  (onMessage) => {
    let skipAllBecauseBrowserIsGoingToBeReloaded = false;

    const postOutput = (message: Output): void => {
      if (message._tag === "onResetOrRestore")
        skipAllBecauseBrowserIsGoingToBeReloaded = true;
      onMessage(message);
    };

    const handleError = flow(UnknownError.unknownError, (error) =>
      postOutput({ _tag: "onError", error })
    );

    // const syncWorker = new Worker(new URL("./Sync.worker.js", import.meta.url));

    const post = pipe(
      Effect.gen(function* ($) {
        const db = yield* $(createDb);
        const owner = yield* $(Effect.provideService(Db.init(), Db.Db, db));

        console.log(db, owner);

        // hmm, ale co ten config?
        // na zaklade message vyberu effect
        // a pustim ho v tom streamu

        return (_message: Input) => {
          //
        };
      }),
      Effect.catchAllCause((cause) => {
        pipe(
          Cause.failureOrCause(cause),
          Either.match(absurd, flow(Cause.squash, handleError))
        );
        return Effect.succeed(constVoid);
      }),
      Effect.runPromise
    );

    return {
      post: (message): void => {
        post.then((post) => post(message));
      },
    };
  };
