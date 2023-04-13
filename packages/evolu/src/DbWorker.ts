import * as Brand from "@effect/data/Brand";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as Config from "./Config.js";
import * as Db from "./Db.js";
import * as Diff from "./Diff.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Message from "./Message.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";
import * as Error from "./Error.js";
import * as Timestamp from "./Timestamp.js";

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

export type OnComplete = () => void;

export type Input =
  | {
      readonly _tag: "init";
      readonly config: Config.Config;
      readonly tableDefinitions: Schema.TableDefinitions;
    }
  | {
      readonly _tag: "updateDbSchema";
      readonly tableDefinitions: Schema.TableDefinitions;
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
  readonly post: (input: Input) => void;
}

export type CreateDbWorker = (callback: (output: Output) => void) => DbWorker;

export const create =
  (_db: Effect.Effect<never, never, Db.Db>): CreateDbWorker =>
  (_callback) => {
    return {
      post: (): void => {
        //
      },
    };
  };
