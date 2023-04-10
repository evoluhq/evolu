import * as Config from "./Config.js";
import * as Schema from "./Schema.js";

type DbWorkerInput =
  | {
      readonly type: "init";
      readonly config: Config.Config;
      readonly tableDefinitions: Schema.TableDefinitions;
    }
  | {
      readonly type: "updateDbSchema";
      readonly tableDefinitions: Schema.TableDefinitions;
    };
//   | {
//       readonly type: "send";
//       readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
//       readonly onCompleteIds: readonly OnCompleteId[];
//       readonly queries: readonly QueryString[];
//     };

//   | {
//       readonly type: "query";
//       readonly queries: ReadonlyNonEmptyArray<QueryString>;
//     }
//   | {
//       readonly type: "receive";
//       readonly messages: readonly CrdtMessage[];
//       readonly merkleTree: MerkleTree;
//       readonly previousDiff: Option<Millis>;
//     }
//   | {
//       readonly type: "sync";
//       readonly queries: Option<ReadonlyNonEmptyArray<QueryString>>;
//     }
//   | {
//       readonly type: "resetOwner";
//     }
//   | {
//       readonly type: "restoreOwner";
//       readonly mnemonic: Mnemonic;
//     };

// type DbWorkerOutput =

interface DbWorker {
  readonly post: (input: DbWorkerInput) => {
    // post
  };
}

export const create = (): DbWorker => {
  throw "";
};
