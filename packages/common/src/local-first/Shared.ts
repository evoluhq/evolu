/**
 * Platform-agnostic Evolu Worker.
 *
 * @module
 */

import {
  emptyArray,
  firstInArray,
  isNonEmptyArray,
  shiftFromArray,
  type NonEmptyReadonlyArray,
} from "../Array.js";
import { assert, assertNotAborted } from "../Assert.js";
import { createCallbacks } from "../Callbacks.js";
import type { ConsoleEntry, ConsoleLevel } from "../Console.js";
import { exhaustiveCheck } from "../Function.js";
import { createSharedResourceByKey } from "../Resource.js";
import { ok } from "../Result.js";
import { spaced } from "../Schedule.js";
import type { NonEmptyReadonlySet } from "../Set.js";
import { repeat, type Fiber, type Task } from "../Task.js";
import { createId, type Id, type Name } from "../Type.js";
import type { Callback, ExtractType } from "../Types.js";
import type { CreateWebSocketDep } from "../WebSocket.js";
import type {
  SharedWorker as CommonSharedWorker,
  MessagePort,
  NativeMessagePort,
  SharedWorkerSelf,
  WorkerDeps,
} from "../Worker.js";
import type { EvoluError } from "./Error.js";
import type { OwnerId, SyncOwner } from "./Owner.js";
import {
  makePatches,
  type Patch,
  type Query,
  type RowsByQueryMap,
} from "./Query.js";
import type { MutationChange } from "./Schema.js";
import type { CrdtMessage } from "./Storage.js";

export type SharedWorker = CommonSharedWorker<SharedWorkerInput>;

export interface SharedWorkerDep {
  readonly sharedWorker: SharedWorker;
}

// interface TransportsDep {
//   readonly transports: SharedTransportResources;
// }

export type SharedWorkerDeps = WorkerDeps & CreateWebSocketDep;

export type SharedWorkerInput =
  | {
      readonly type: "InitTab";
      readonly consoleLevel: ConsoleLevel;
      readonly port: NativeMessagePort<EvoluTabOutput>;
    }
  | {
      readonly type: "CreateEvolu";
      readonly name: Name;
      readonly appOwner: SyncOwner;
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
      readonly onCompleteIds: ReadonlyArray<Id>;
      readonly subscribedQueries: ReadonlySet<Query>;
    }
  | {
      readonly type: "Query";
      readonly queries: NonEmptyReadonlySet<Query>;
    }
  | {
      readonly type: "Export";
    }
  | {
      readonly type: "Dispose";
    };

export type EvoluOutput =
  | {
      readonly type: "OnPatchesByQuery";
      readonly patchesByQuery: ReadonlyMap<Query, ReadonlyArray<Patch>>;
      readonly onCompleteIds: ReadonlyArray<Id>;
    }
  | {
      readonly type: "RefreshQueries";
    }
  | {
      readonly type: "OnExport";
      readonly file: Uint8Array<ArrayBuffer>;
    };

export const initSharedWorker =
  (
    self: SharedWorkerSelf<SharedWorkerInput>,
  ): Task<AsyncDisposableStack, never, SharedWorkerDeps> =>
  async (run) => {
    const {
      createMessagePort,
      consoleStoreOutputEntry,
      createWebSocket: _createWebSocket,
    } = run.deps;
    const console = run.deps.console.child("SharedWorker");

    // TODO: Use heartbeat to detect and prune dead ports.
    const tabPorts = new Set<MessagePort<EvoluTabOutput>>();

    const queuedTabOutputs: Array<EvoluTabOutput> = [];
    const postTabOutput = (output: EvoluTabOutput): void => {
      if (tabPorts.size === 0) queuedTabOutputs.push(output);
      else for (const port of tabPorts) port.postMessage(output);
    };

    // const createTransportId = (transport: OwnerTransport): string =>
    //   `${transport.type}:${transport.url}`;

    await using stack = new AsyncDisposableStack();

    // const transports = stack.use(
    //   createResources<WebSocket, string, OwnerTransport, SyncOwner, OwnerId>({
    //     createResource: async (transport) => {
    //       const transportId = createTransportId(transport);
    //       console.info("createTransportResource", { transportId });
    //       return await run.daemon.orThrow(
    //         createWebSocket(transport.url, {
    //           binaryType: "arraybuffer",
    //           onOpen: () => {
    //             console.debug("transportOpen", { transportId });
    //           },
    //           onClose: () => {
    //             console.debug("transportClose", { transportId });
    //           },
    //         }),
    //       );
    //     },
    //     getResourceId: createTransportId,
    //     getConsumerId: (owner) => owner.id,
    //   }),
    // );

    const initSharedWorkerRun = run.create();
    // .addDeps({ transports });

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
            void initSharedWorkerRun(async (run) => {
              const sharedEvoluResult = await run(
                sharedEvolusByName.acquire(message.name),
              );
              assertNotAborted(sharedEvoluResult);

              sharedEvoluResult.value.addPorts(
                message.evoluPort,
                message.dbWorkerPort,
                () => {
                  void initSharedWorkerRun(
                    sharedEvolusByName.release(message.name),
                  );
                },
              );
              return ok();
            });
            break;
          }
          default:
            console.error("Unknown shared worker input", message);
        }
      };
    };

    const sharedEvolusByName = stack.use(
      await run.orThrow(
        createSharedResourceByKey((name: Name) =>
          createSharedEvolu({ name, postTabOutput }),
        ),
      ),
    );

    stack.defer(
      consoleStoreOutputEntry.subscribe(() => {
        const entry = consoleStoreOutputEntry.get();
        if (entry) postTabOutput({ type: "OnConsoleEntry", entry });
      }),
    );

    console.info("initSharedWorker");

    return ok(stack.move());
  };

interface SharedEvolu extends AsyncDisposable {
  readonly addPorts: (
    evoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
    dbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
    releaseSharedEvolu: () => void,
  ) => void;
}

export interface DbWorkerQueueItem {
  readonly evoluPortId: Id;
  readonly request: ExtractType<EvoluInput, "Mutate" | "Query" | "Export">;
}

export interface DbWorkerInput extends DbWorkerQueueItem {
  readonly callbackId: Id;
}

export type DbWorkerOutput =
  | {
      readonly type: "LeaderAcquired";
      readonly name: Name;
    }
  | {
      readonly type: "OnQueuedResponse";
      readonly callbackId: Id;
      readonly evoluPortId: Id;
      readonly response: QueuedResponse;
    }
  | EvoluTabOutput;

export type QueuedResponse =
  | {
      readonly type: "Mutate";
      readonly messagesByOwnerId: ReadonlyMap<
        OwnerId,
        NonEmptyReadonlyArray<CrdtMessage>
      >;
      readonly rowsByQuery: RowsByQueryMap;
    }
  | {
      readonly type: "Query";
      readonly rowsByQuery: RowsByQueryMap;
    }
  | {
      readonly type: "Export";
      readonly file: Uint8Array<ArrayBuffer>;
    }
  | {
      readonly type: "CreateSyncMessages";
    };

export interface QueuedResult {
  readonly evoluPortId: Id;
  readonly response: QueuedResponse;
}

// type SharedTransportResources = Resources<
//   WebSocket,
//   string,
//   OwnerTransport,
//   SyncOwner,
//   OwnerId
// >;

export type SyncState = 123;

const createSharedEvolu =
  ({
    name,
    postTabOutput,
  }: {
    name: Name;
    postTabOutput: Callback<EvoluTabOutput>;
  }): Task<
    SharedEvolu,
    never,
    SharedWorkerDeps
    /*& TransportsDep*/
  > =>
  (run) => {
    const console = run.deps.console.child(name).child("SharedWorker");
    const { createMessagePort } = run.deps;
    // transports

    const evoluPorts = new Map<Id, MessagePort<EvoluOutput, EvoluInput>>();
    const dbWorkerPorts = new Set<MessagePort<DbWorkerInput, DbWorkerOutput>>();
    const rowsByQueryByEvoluPortId = new Map<Id, RowsByQueryMap>();
    const queue: Array<DbWorkerQueueItem> = [];
    const callbacks = createCallbacks<QueuedResult>(run.deps);

    let activeDbWorkerPort = null as MessagePort<
      DbWorkerInput,
      DbWorkerOutput
    > | null;

    let queueProcessingFiber: Fiber<void, never, WorkerDeps> | null = null;
    let isDisposed = false;

    // const ownerTransports = appOwner.transports ?? emptyArray;

    // await run(transports.addConsumer(appOwner, ownerTransports));

    const ensureQueueProcessing = (): void => {
      if (
        queueProcessingFiber ||
        !isNonEmptyArray(queue) ||
        !activeDbWorkerPort
      ) {
        return;
      }

      const first = firstInArray(queue);

      const callbackId = callbacks.register(({ evoluPortId, response }) => {
        queueProcessingFiber?.abort();
        queueProcessingFiber = null;

        const evoluPort = evoluPorts.get(evoluPortId);

        switch (response.type) {
          case "Mutate":
          case "Query": {
            if (evoluPort)
              evoluPort.postMessage({
                type: "OnPatchesByQuery",
                patchesByQuery: createPatchesByQuery(
                  evoluPortId,
                  response.rowsByQuery,
                ),
                onCompleteIds:
                  first.request.type === "Mutate"
                    ? first.request.onCompleteIds
                    : emptyArray,
              });

            if (response.type === "Mutate") {
              for (const [otherEvoluPortId, otherEvoluPort] of evoluPorts) {
                if (otherEvoluPortId === evoluPortId) continue;
                otherEvoluPort.postMessage({ type: "RefreshQueries" });
              }
            }
            break;
          }
          case "Export":
            if (evoluPort)
              evoluPort.postMessage(
                {
                  type: "OnExport",
                  file: response.file,
                },
                [response.file.buffer],
              );

            break;
          case "CreateSyncMessages":
            break;
          default:
            console.error("Unknown queued response", response);
        }

        // Complete the current queue item and continue with the next one.
        shiftFromArray(queue);
        ensureQueueProcessing();
      });

      queueProcessingFiber = run.daemon(
        repeat(() => {
          assert(activeDbWorkerPort, "Expected an active DbWorker");
          activeDbWorkerPort.postMessage({ callbackId, ...first });
          return ok();
        }, spaced("5s")), // 5s seems to be a good balance
      );
    };

    const createPatchesByQuery = (
      evoluPortId: Id,
      rowsByQuery: RowsByQueryMap,
    ): ReadonlyMap<Query, ReadonlyArray<Patch>> => {
      const previousRowsByQuery = rowsByQueryByEvoluPortId.get(evoluPortId);
      const nextRowsByQuery = new Map(previousRowsByQuery ?? emptyArray);
      const patchesByQuery = new Map<Query, ReadonlyArray<Patch>>();

      for (const [query, rows] of rowsByQuery) {
        nextRowsByQuery.set(query, rows);
        patchesByQuery.set(
          query,
          makePatches(previousRowsByQuery?.get(query), rows),
        );
      }

      rowsByQueryByEvoluPortId.set(evoluPortId, nextRowsByQuery);
      return patchesByQuery;
    };

    const addPorts = (
      nativeEvoluPort: NativeMessagePort<EvoluOutput, EvoluInput>,
      nativeDbWorkerPort: NativeMessagePort<DbWorkerInput, DbWorkerOutput>,
      releaseSharedEvolu: () => void,
    ): void => {
      assert(
        !isDisposed,
        "SharedEvolu.addPorts must not be called after disposal.",
      );

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
            if (!evoluPorts.has(evoluPortId)) break;

            console.info("evoluDispose", {
              name,
              evoluPortId,
              hadLastPort: evoluPorts.size === 1,
            });
            evoluPorts.delete(evoluPortId);
            // Potential plan: keep DbWorker ports in a SharedResource
            // abstraction instead of deleting them eagerly here. DbWorkers use
            // leader election because SQLite WASM needs a single active owner.
            // When the last Evolu instance is disposed, broadcast shutdown to
            // all DbWorkers so the current leader can dispose itself and the
            // followers can clean up consistently.
            dbWorkerPorts.delete(dbWorkerPort);
            rowsByQueryByEvoluPortId.delete(evoluPortId);
            releaseSharedEvolu();

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
    };

    return ok({
      addPorts,

      // eslint-disable-next-line @typescript-eslint/require-await
      [Symbol.asyncDispose]: async () => {
        isDisposed = true;
        // await run(transports.removeConsumer(appOwner, ownerTransports));

        queueProcessingFiber?.abort();
        queueProcessingFiber = null;
        callbacks[Symbol.dispose]();
        activeDbWorkerPort = null;
        queue.length = 0;
        evoluPorts.clear();
        rowsByQueryByEvoluPortId.clear();
        dbWorkerPorts.clear();
      },
    });
  };

//   | (Typed<"reset"> & {
//       readonly onCompleteId: CallbackId;
//       readonly reload: boolean;
//       readonly restore?: {
//         readonly sqliteSchema: SqliteSchema;
//         readonly mnemonic: Mnemonic;
//       };
//     })
//   | (Typed<"ensureSqliteSchema"> & {
//       readonly sqliteSchema: SqliteSchema;
//     })
//   | (Typed<"export"> & {
//       readonly onCompleteId: CallbackId;
//     })
//   | (Typed<"useOwner"> & {
//       readonly use: boolean;
//       readonly owner: SyncOwner;
//     });
//   | (Typed<"onReset"> & {
//       readonly onCompleteId: CallbackId;
//       readonly reload: boolean;
//     })
