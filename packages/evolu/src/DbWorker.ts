import * as Brand from "@effect/data/Brand";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Config from "./Config.js";
import * as Diff from "./Diff.js";
import * as MerkleTree from "./MerkleTree.js";
import * as Message from "./Message.js";
import * as Owner from "./Owner.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Query from "./Query.js";
import * as Schema from "./Schema.js";
import * as Timestamp from "./Timestamp.js";
import { constVoid } from "@effect/data/Function";

type OnCompleteId = string & Brand.Brand<"Id"> & Brand.Brand<"OnComplete">;

type Input =
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
      readonly queries: ReadonlyArray<Query.QueryString>;
    }
  | {
      readonly type: "query";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query.QueryString>;
    }
  | {
      readonly type: "receive";
      readonly messages: ReadonlyArray<Message.Message>;
      readonly merkleTree: MerkleTree.MerkleTree;
      readonly previousDiff: Timestamp.Millis | null;
    }
  | {
      readonly type: "sync";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query.QueryString> | null;
    }
  | {
      readonly type: "resetOwner";
    }
  | {
      readonly type: "restoreOwner";
      readonly mnemonic: Mnemonic.Mnemonic;
    };

type Output =
  | { readonly type: "onError"; readonly error: unknown } // TODO: Explicit list of errors
  | { readonly type: "onOwner"; readonly owner: Owner.Owner }
  | {
      readonly type: "onQuery";
      readonly queriesPatches: ReadonlyArray<Diff.QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
    }
  | { readonly type: "onReceive" }
  | { readonly type: "onResetOrRestore" };

interface DbWorker {
  readonly post: (input: Input) => void;
}

const isServer = typeof window === "undefined" || "Deno" in window;

export const create = (_onMessage: (output: Output) => void): DbWorker => {
  const post = isServer ? constVoid : constVoid;

  return { post };
};
