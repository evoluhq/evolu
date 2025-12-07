import { SqliteError } from "better-sqlite3";
import { DecryptWithXChaCha20Poly1305Error } from "../Crypto.js";
import { TransferableError } from "../Error.js";
import { SimpleName } from "../Type.js";
import { SharedWorker as CommonSharedWorker } from "../Worker.js";
import { ProtocolError } from "./Protocol.js";
import { TimestampError } from "./Timestamp.js";

export type SharedWorker = CommonSharedWorker<
  SharedWorkerInput,
  SharedWorkerOutput
>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

export type SharedWorkerInput =
  | {
      readonly type: "init";
      readonly name: SimpleName;
      //   readonly config: DbConfig;
      //   readonly dbSchema: DbSchema;
    }
  | {
      readonly type: "dispose";
      readonly name: SimpleName;
    };

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SharedWorkerOutput = {
  readonly type: "onError";
  readonly error:
    | ProtocolError
    | SqliteError
    | DecryptWithXChaCha20Poly1305Error
    | TimestampError
    | TransferableError;
};
//   | {
//       readonly type: "onExport";
//       readonly onCompleteId: CallbackId;
//       readonly file: Uint8Array;
//     };

// export type SharedWorkerPlatformDeps = ConsoleDep &
//   CreateSqliteDriverDep &
//   CreateWebSocketDep &
//   RandomBytesDep &
//   RandomDep &
//   TimeDep;
