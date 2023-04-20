import * as Brand from "@effect/data/Brand";
import * as Context from "@effect/data/Context";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Ref from "@effect/io/Ref";
import * as Config from "./Config.js";
import * as Db from "./Db.js";
import * as Diff from "./Diff.js";
import * as Error from "./Error.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Message from "./Message.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Schema from "./Schema.js";
import * as Timestamp from "./Timestamp.js";

export type OnComplete = () => void;

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

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
  | { readonly _tag: "onOwner"; readonly owner: Db.Owner }
  | {
      readonly _tag: "onQuery";
      readonly queriesPatches: ReadonlyArray<Diff.QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
    }
  | { readonly _tag: "onReceive" }
  | { readonly _tag: "onResetOrRestore" };

// Consider if it shouldn't be an effect.
export type OnMessage = (message: Output) => void;
export const OnMessage = Context.Tag<OnMessage>();

// Consider if it shouldn't be an effect.
export type Post = (message: Input) => void;

export interface DbWorker {
  readonly post: Post;
}

export type CreateDbWorker = (onMessage: OnMessage) => DbWorker;

export type RowsCache = Ref.Ref<ReadonlyMap<Db.QueryString, Db.Rows>>;
export const RowsCache = Context.Tag<RowsCache>();
