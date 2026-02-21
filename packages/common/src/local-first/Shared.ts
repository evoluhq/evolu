/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import {
  firstInArray,
  isNonEmptyArray,
  shiftFromArray,
  type NonEmptyReadonlyArray,
} from "../Array.js";
import { assert } from "../Assert.js";
import { createCallbacks, type CallbackId } from "../Callbacks.js";
import type { Console, ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { createInstances } from "../Instances.js";
import { ok } from "../Result.js";
import { spaced } from "../Schedule.js";
import type { SqliteRow } from "../Sqlite.js";
import { repeat, type Run, type Task } from "../Task.js";
import { createId, type Id, type Name } from "../Type.js";
import type { Callback, ExtractType } from "../Types.js";
import type {
  SharedWorker as CommonSharedWorker,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.js";
import type { EvoluError } from "./Error.js";
import type { OwnerId } from "./Owner.js";
import type { Query, QueryPatches } from "./Query.js";
import type { MutationChange } from "./Schema.js";
import type { CrdtMessage } from "./Storage.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

export type SharedWorkerInput =
  | {
      readonly type: "InitTab";
      readonly consoleLevel: ConsoleLevel;
      readonly port: NativeMessagePort<EvoluTabOutput>;
    }
  | {
      readonly type: "CreateEvolu";
      readonly name: Name;
      readonly evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>;
      readonly dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>;
    };

export type EvoluTabOutput =
  | {
      readonly type: "OnConsoleEntry";
      readonly entry: ConsoleEntry;
    }
  | {
      readonly type: "OnError";
      readonly error: EvoluError;
    };

export type EvoluInput =
  | {
      readonly type: "Mutate";
      readonly changes: NonEmptyReadonlyArray<MutationChange>;
      readonly onCompleteIds: ReadonlyArray<CallbackId>;
      readonly subscribedQueries: ReadonlyArray<Query>;
    }
  | {
      readonly type: "Query";
      readonly queries: ReadonlyArray<Query>;
    }
  | {
      readonly type: "Export";
      readonly callbackId: CallbackId;
    }
  | {
      readonly type: "Dispose";
    };

export type EvoluOutput =
  | {
      readonly type: "OnQueryPatches";
      readonly queryPatches: ReadonlyArray<QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<CallbackId>;
    }
  | {
      readonly type: "OnExport";
      readonly callbackId: CallbackId;
      readonly file: Uint8Array<ArrayBuffer>;
    };

export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput>,
  ): Task<AsyncDisposableStack, never, WorkerDeps> =>
  async (run) => {
    const { createMessagePort, consoleStoreOutputEntry } = run.deps;
    const console = run.deps.console.child("SharedWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<EvoluTabOutput>>();

    const queuedTabOutputs: Array<EvoluTabOutput> = [];
    const postTabOutput = (output: EvoluTabOutput): void => {
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else for (const port of tabPorts) port.postMessage(output);
    };

    await using stack = run.stack();

    // TODO: Use heartbeat to detect and prune dead instances.
    const sharedEvolus = stack.use(createInstances<Name, SharedEvolu>());

    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (entry) postTabOutput({ type: "OnConsoleEntry", entry });
      }),
    );

    console.info("initSharedWorker");

    self.onConnect = (port) => {
      console.debug("onConnect");

      port.onMessage = (message) => {
        switch (message.type) {
          case "InitTab": {
            // One SharedWorker serves multiple tabs, so console level is global
            // here. The most recently initialized tab's level wins.
            console.setLevel(message.consoleLevel);

            const tabPort = createMessagePort<EvoluTabOutput>(message.port);
            tabPorts.add(tabPort);
            if (queuedTabOutputs.length > 0) {
              queuedTabOutputs.forEach(postTabOutput);
              queuedTabOutputs.length = 0;
            }
            break;
          }

          case "CreateEvolu": {
            sharedEvolus
              .ensure(message.name, () =>
                createSharedEvolu({
                  run,
                  console,
                  name: message.name,
                  postTabOutput,
                  onDispose: () => {
                    sharedEvolus.delete(message.name);
                  },
                }),
              )
              .addPorts(message.evoluPort, message.dbWorkerPort);
            break;
          }
          default:
            exhaustiveCheck(message);
        }
      };
    };

    return ok(stack.move());
  };

interface SharedEvolu extends Disposable {
  readonly addPorts: (
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
    dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
  ) => void;
}

export interface DbWorkerQueueItem {
  readonly evoluPortId: Id;
  readonly request: ExtractType<EvoluInput, "Mutate" | "Query" | "Export">;
}

export interface DbWorkerInput extends DbWorkerQueueItem {
  readonly callbackId: CallbackId;
}

export type DbWorkerOutput =
  | {
      readonly type: "LeaderAcquired";
      readonly name: Name;
    }
  | {
      readonly type: "OnQueuedResponse";
      readonly callbackId: CallbackId;
      readonly evoluPortId: Id;
      readonly response: QueuedResponse;
    }
  | EvoluTabOutput;

export type QueuedResponse =
  | {
      readonly type: "Mutate";
      readonly output: {
        readonly messagesByOwnerId: ReadonlyMap<
          OwnerId,
          NonEmptyReadonlyArray<CrdtMessage>
        >;
        readonly rowsByQuery: ReadonlyMap<Query, ReadonlyArray<SqliteRow>>;
      };
    }
  | {
      readonly type: "Query";
      readonly rowsByQuery: ReadonlyMap<Query, ReadonlyArray<SqliteRow>>;
    }
  | {
      readonly type: "Export";
      readonly file: Uint8Array<ArrayBuffer>;
    };

export interface QueuedResult {
  readonly evoluPortId: Id;
  readonly response: QueuedResponse;
}

// createSharedEvolu could be Task, but Instances doesn't support it yet.
const createSharedEvolu = ({
  run,
  console,
  name,
  postTabOutput,
  onDispose,
}: {
  run: Run<WorkerDeps>;
  console: Console;
  name: Name;
  postTabOutput: Callback<EvoluTabOutput>;
  onDispose: () => void;
}): SharedEvolu => {
  const { createMessagePort } = run.deps;

  const evoluPorts = new Map<Id, MessagePort<EvoluOutput, EvoluInput>>();
  const dbWorkerPorts = new Set<MessagePort<DbWorkerInput, DbWorkerOutput>>();

  const queue: Array<DbWorkerQueueItem> = [];
  const callbacks = createCallbacks<QueuedResult>(run.deps);

  let activeDbWorkerPort = null as MessagePort<
    DbWorkerInput,
    DbWorkerOutput
  > | null;

  let isQueueProcessing = false;

  const ensureQueueProcessing = (): void => {
    if (isQueueProcessing || !isNonEmptyArray(queue) || !activeDbWorkerPort) {
      return;
    }
    isQueueProcessing = true;

    const first = firstInArray(queue);

    const callbackId = callbacks.register(({ evoluPortId, response }) => {
      fiber.abort();

      // TODO: Handle asi driv, at je to asap? Imho je to skoro jedno,
      // ale asi lepsi ohadlovat, nez se jde na dalsi.

      // Complete the current queue item and continue with the next one.
      shiftFromArray(queue);
      isQueueProcessing = false;
      ensureQueueProcessing();

      const evoluPort = evoluPorts.get(evoluPortId);

      switch (response.type) {
        case "Mutate": {
          assert(first.request.type === "Mutate", "Expected Mutate input");

          const processedMutateOutput = {
            output: response.output,
            onCompleteIds: first.request.onCompleteIds,
          };

          if (evoluPort) {
            // TODO: Post converted OnQueryPatches to evoluPort.
          }

          // TODO: Convert processedMutateOutput into OnQueryPatches and post it.
          console.debug(processedMutateOutput);
          break;
        }
        case "Query":
          // TODO: Handle query output.
          break;
        case "Export":
          assert(first.request.type === "Export", "Expected Export input");
          if (evoluPort)
            evoluPort.postMessage(
              {
                type: "OnExport",
                callbackId: first.request.callbackId,
                file: response.file,
              },
              [response.file.buffer],
            );

          break;
        default:
          exhaustiveCheck(response);
      }
    });

    const fiber = run.daemon(
      repeat(() => {
        assert(activeDbWorkerPort, "Expected an active DbWorker");
        activeDbWorkerPort.postMessage({ callbackId, ...first });
        return ok();
      }, spaced("5s")), // 5s seems to be a good balance
    );
  };

  return {
    addPorts: (nativeEvoluPort, nativeDbWorkerPort) => {
      const evoluPort = createMessagePort<EvoluOutput, EvoluInput>(
        nativeEvoluPort,
      );
      const dbWorkerPort = createMessagePort<DbWorkerInput, DbWorkerOutput>(
        nativeDbWorkerPort,
      );

      const evoluPortId = createId(run.deps);

      evoluPorts.set(evoluPortId, evoluPort);
      dbWorkerPorts.add(dbWorkerPort);

      dbWorkerPort.onMessage = (message) => {
        switch (message.type) {
          case "LeaderAcquired": {
            activeDbWorkerPort = dbWorkerPort;
            console.info("leaderAcquired");
            ensureQueueProcessing();
            break;
          }
          case "OnQueuedResponse": {
            callbacks.execute(message.callbackId, {
              evoluPortId: message.evoluPortId,
              response: message.response,
            });
            break;
          }
          case "OnConsoleEntry":
          case "OnError": {
            postTabOutput(message);
            break;
          }
          default:
            exhaustiveCheck(message);
        }
      };

      evoluPort.onMessage = (evoluMessage) => {
        switch (evoluMessage.type) {
          case "Dispose": {
            console.info("evoluDispose", {
              name,
              evoluPortId,
              hadLastPort: evoluPorts.size === 1,
            });
            evoluPorts.delete(evoluPortId);
            if (evoluPorts.size === 0) onDispose();
            // TODO: Decided what to do with DbWorker but probably dispose it, but
            // https://bugs.webkit.org/show_bug.cgi?id=301520
            break;
          }

          case "Mutate":
          case "Query":
          case "Export": {
            queue.push({ evoluPortId, request: evoluMessage });
            ensureQueueProcessing();
            break;
          }
          default:
            exhaustiveCheck(evoluMessage);
        }
      };
    },

    [Symbol.dispose]: () => {
      activeDbWorkerPort = null;
      queue.length = 0;
      evoluPorts.clear();
      dbWorkerPorts.clear();
    },
  };
};

// export type DbWorkerInput =
//   | (Typed<"init"> & {
//       readonly config: DbConfig;
//       readonly dbSchema: DbSchema;
//     })
//   | Typed<"getAppOwner">
//   | (Typed<"mutate"> & {
//       readonly tabId: Id;
//       readonly changes: NonEmptyReadonlyArray<MutationChange>;
//       readonly onCompleteIds: ReadonlyArray<CallbackId>;
//       readonly subscribedQueries: ReadonlyArray<Query>;
//     })
//   | (Typed<"query"> & {
//       readonly tabId: Id;
//       readonly queries: NonEmptyReadonlyArray<Query>;
//     })
//   | (Typed<"reset"> & {
//       readonly onCompleteId: CallbackId;
//       readonly reload: boolean;
//       readonly restore?: {
//         readonly dbSchema: DbSchema;
//         readonly mnemonic: Mnemonic;
//       };
//     })
//   | (Typed<"ensureDbSchema"> & {
//       readonly dbSchema: DbSchema;
//     })
//   | (Typed<"export"> & {
//       readonly onCompleteId: CallbackId;
//     })
//   | (Typed<"useOwner"> & {
//       readonly use: boolean;
//       readonly owner: SyncOwner;
//     });

// export type DbWorkerOutput =
//   | (Typed<"onError"> & {
//       readonly error:
//         | ProtocolError
//         | SqliteError
//         | DecryptWithXChaCha20Poly1305Error
//         | TimestampError
//         | UnknownError;
//     })
//   | (Typed<"onGetAppOwner"> & {
//       readonly appOwner: AppOwner;
//     })
//   | (Typed<"onQueryPatches"> & {
//       readonly tabId: Id;
//       readonly queryPatches: ReadonlyArray<QueryPatches>;
//       readonly onCompleteIds: ReadonlyArray<CallbackId>;
//     })
//   | (Typed<"refreshQueries"> & {
//       readonly tabId?: Id;
//     })
//   | (Typed<"onReset"> & {
//       readonly onCompleteId: CallbackId;
//       readonly reload: boolean;
//     })
//   | (Typed<"onExport"> & {
//       readonly onCompleteId: CallbackId;
//       readonly file: Uint8Array;
//     });
