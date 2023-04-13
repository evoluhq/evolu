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
      readonly type: "init";
      readonly config: Config.Config;
      readonly tableDefinitions: Schema.TableDefinitions;
    }
  | {
      readonly type: "updateDbSchema";
      readonly tableDefinitions: Schema.TableDefinitions;
    }
  | {
      readonly type: "send";
      readonly messages: ReadonlyArray.NonEmptyReadonlyArray<Message.NewMessage>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
      readonly queries: ReadonlyArray<Db.QueryString>;
    }
  | {
      readonly type: "query";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Db.QueryString>;
    }
  | {
      readonly type: "receive";
      readonly messages: ReadonlyArray<Message.Message>;
      readonly merkleTree: MerkleTree.MerkleTree;
      readonly previousDiff: Timestamp.Millis | null;
    }
  | {
      readonly type: "sync";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Db.QueryString> | null;
    }
  | {
      readonly type: "resetOwner";
    }
  | {
      readonly type: "restoreOwner";
      readonly mnemonic: Mnemonic.Mnemonic;
    };

export type Output =
  | { readonly type: "onError"; readonly error: Error.Error }
  | { readonly type: "onOwner"; readonly owner: Owner.Owner }
  | {
      readonly type: "onQuery";
      readonly queriesPatches: ReadonlyArray<Diff.QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
    }
  | { readonly type: "onReceive" }
  | { readonly type: "onResetOrRestore" };

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
