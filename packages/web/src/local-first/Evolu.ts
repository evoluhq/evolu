import {
  callback,
  createUnknownError,
  err,
  exhaustiveCheck,
  ok,
  tryAsync,
  trySync,
  type ConsoleDep,
  type ReloadApp,
  type ReloadAppDep,
  type Task,
  type UnknownError,
  type UnsupportedDbVersionError,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import type {
  SharedWorker as CommonSharedWorker,
  CreateDbWorker,
  DbWorkerInit,
  CreateMemoryInstanceWorkerDep,
  Evolu,
  EvoluConfig,
  EvoluDeps,
  RequestPersistentStorageDep,
  SharedWorkerId,
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import {
  BuildWaiting,
  BuildWaitingRequest,
  buildsBroadcastChannelName,
  createEvoluDeps as createCommonEvoluDeps,
} from "@evolu/common/local-first";
import { reloadApp } from "../Platform.ts";
import { createRun } from "../Task.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
  installOneTabSharedWorkerPolyfill,
} from "../Worker.ts";

export interface SharedWorkerUnsupported {
  readonly type: "SharedWorkerUnsupported";
}

export interface SharedWorkerUnsupportedDep {
  readonly onSharedWorkerUnsupported: () => void;
}

/**
 * Creates Evolu dependencies for the web platform.
 *
 * Checks storage once when the deps are created. If it is available, the tab
 * starts its stored worker as soon as that check resolves, without waiting for
 * an instance. It then reloads for new builds until it closes, which also ends
 * any {@link EvoluConfig.memoryOnly} instances. It reloads at once if the user
 * is not in the tab, otherwise once they leave it. See Builds in the Shared
 * module of `@evolu/common`. A tab whose database refuses to start with
 * {@link UnsupportedDbVersionError} reloads once for each stored version, even
 * while the user is in it, because the server may now serve a build that
 * supports the database. The error is reported when the reloaded build refuses
 * it too, or when the tab has no session storage. A tab whose stored worker was
 * relaunched without its state, as WebKit does when the process hosting it
 * ends, also reloads at once. Closing another tab can trigger that Safari
 * relaunch and end this tab's memory instances when storage is available.
 *
 * If storage is refused, the tab never starts the stored worker, and build
 * coordination never reloads it. The `syncState` store includes only the memory
 * databases of instances these dependencies created. The `evoluError` store
 * includes only errors from the workers of memory instances these dependencies
 * created. The back-forward cache reload described below and
 * {@link Evolu.deleteDatabase}'s default reload, without
 * {@link EvoluConfig.onDatabaseDeleted}, still apply.
 *
 * When the page enters the browser's back-forward cache, as Safari does on
 * every navigation away, this tab ends its part as if it closed: it stops the
 * database workers it hosts, so another tab takes over stored databases, and
 * ends this tab's Evolu instances. Memory databases end with their instances.
 * The tab reloads if the user comes back to it.
 *
 * Where the browser offers no persistent storage, as in Safari's Private
 * Browsing or a Firefox private window, the database is kept in memory, and
 * {@link Evolu.devicePersistence} resolves to `NotPersisted`, so the app can
 * tell the user. Each memory instance has its own database and workers in its
 * own tab. When storage is refused, closing another tab leaves it intact.
 * Explicit memory instances in a tab with storage also end when Evolu reloads
 * that tab for a waiting build, a stored worker relaunch, or a database
 * refusal. Data that exists only locally, or has not synced yet, is lost when
 * the instance ends, including when its tab closes, reloads, or enters the
 * back-forward cache. A memory instance exchanges changes with every other
 * instance, stored instances of the same owner included, only through relays,
 * so not offline. Each opens its own relay sockets, even beside a stored
 * instance of the same owner.
 *
 * After the first local mutation of a database the browser stores, this tab
 * asks the browser once with `navigator.storage.persist()` not to delete the
 * site's data when disk space runs low. Chrome and Safari decide silently, and
 * Firefox asks the user, so every tab asks until the user allows it. A custom
 * {@link RequestPersistentStorageDep.requestPersistentStorage} replaces the
 * request, for example with `constVoid` to never ask. See [Will my data stay on
 * the
 * device?](https://www.evolu.dev/docs/faq#will-my-data-stay-on-the-device).
 *
 * A custom {@link ReloadApp} replaces the default page reload, for example to
 * save state first. It should end by reloading the page, because the other
 * build waits until this tab reloads or closes, and a page restored from the
 * back-forward cache cannot work until it reloads.
 *
 * It installs the polyfills Evolu needs, such as `DisposableStack`, which
 * Safari lacks, so apps don't have to call `installPolyfills` first.
 */
export const createEvoluDeps = (
  deps: Partial<ConsoleDep> &
    Partial<ReloadAppDep> &
    Partial<SharedWorkerUnsupportedDep> &
    Partial<RequestPersistentStorageDep> = {},
): EvoluDeps => {
  installPolyfills();
  installOneTabSharedWorkerPolyfill();
  const reloadThisApp = deps.reloadApp ?? reloadApp;
  // A page an automatic reload loaded never announces its build, so two builds
  // cannot keep reloading each other.
  const isAutomaticReload = takeAutomaticReload();
  // Waiting workers this tab already reloaded for. A reload that loaded the
  // running build again did not help, so the tab does not repeat it.
  const reloadedForWorkerIds = getReloadedForWorkerIds();
  // Versions a refusal already reloaded this tab for, read once, so every
  // refusal before this page unloads reloads it.
  const refusalReloadVersions = getRefusalReloadVersions();

  let connectedWorkerId: SharedWorkerId | null = null;
  let waitingWorkerId: SharedWorkerId | null = null;
  // Workers announced before this tab connected. The lock can pass to this
  // tab's worker first, and their tabs may not answer a request, for example
  // when frozen, so the tab handles them once it connects.
  const earlyAnnouncedWorkerIds = new Set<SharedWorkerId>();
  // Checks whether the user left this tab while another build waits.
  let focusCheckId: ReturnType<typeof setInterval> | null = null;
  let isPersistentStorageRequested = false;

  using disposer = new DisposableStack();
  // Owns these deps' async work, so disposing them aborts it.
  const run = disposer.use(createRun());
  const buildsBroadcastChannel = disposer.use(
    createBroadcastChannel<unknown>(buildsBroadcastChannelName),
  );

  const stopFocusCheck = (): void => {
    if (focusCheckId === null) return;
    clearInterval(focusCheckId);
    focusCheckId = null;
  };
  disposer.defer(stopFocusCheck);

  const announceWaitingBuild = (): void => {
    if (waitingWorkerId === null || isAutomaticReload) return;
    buildsBroadcastChannel.postMessage({
      type: "BuildWaiting",
      workerId: waitingWorkerId,
    } satisfies BuildWaiting);
  };

  const reloadForWaitingBuild = (workerId: SharedWorkerId): void => {
    stopFocusCheck();
    // Without session storage, the reloaded page could announce in turn.
    if (!markAutomaticReload(workerId)) return;
    reloadThisApp();
  };

  const handleWaitingBuild = (workerId: SharedWorkerId): void => {
    if (workerId === connectedWorkerId || reloadedForWorkerIds.has(workerId)) {
      return;
    }
    if (!document.hasFocus()) {
      reloadForWaitingBuild(workerId);
      return;
    }
    // Focus can leave the page from a frame without a window event.
    focusCheckId ??= setInterval(() => {
      if (!document.hasFocus()) reloadForWaitingBuild(workerId);
    }, 1000);
  };

  // Builds of different releases share the channel, so messages are validated.
  // Keep announcements until the stored worker connects: their tab may freeze
  // before it can answer that worker's request.
  buildsBroadcastChannel.onMessage = (message) => {
    if (BuildWaitingRequest.is(message)) {
      announceWaitingBuild();
    } else if (BuildWaiting.is(message)) {
      if (connectedWorkerId === null) {
        earlyAnnouncedWorkerIds.add(message.workerId);
      } else handleWaitingBuild(message.workerId);
    }
  };

  const handleSharedWorkerMessage = (
    message: SharedWorkerOutput | SharedWorkerUnsupported,
    forward: (message: SharedWorkerOutput) => void,
  ): void => {
    // WebKit can relaunch a SharedWorker without its state when the process
    // hosting it ends, and connect the tabs' existing ports to the new worker
    // (https://bugs.webkit.org/show_bug.cgi?id=318873). A worker tells a tab
    // at most once that it waits and once that it connected, both with its own
    // id, so only then does a tab hear from a worker with another id. The
    // tab's state, including the databases it asked for while it waited, ended
    // with the old worker, so it reloads at once.
    const knownWorkerId = connectedWorkerId ?? waitingWorkerId;
    if (
      (message.type === "Waiting" || message.type === "Connected") &&
      knownWorkerId !== null &&
      message.workerId !== knownWorkerId
    ) {
      reloadThisApp();
      return;
    }

    switch (message.type) {
      case "DbWorkerInit": {
        forward(message);
        break;
      }

      case "Error": {
        // The page is about to reload, so the error is not reported.
        if (
          message.error.type === "UnsupportedDbVersionError" &&
          !refusalReloadVersions.has(String(message.error.storedVersion)) &&
          markRefusalReload(message.error)
        ) {
          reloadThisApp();
          break;
        }
        forward(message);
        break;
      }

      case "Waiting": {
        waitingWorkerId = message.workerId;
        announceWaitingBuild();
        forward(message);
        break;
      }

      case "Connected": {
        waitingWorkerId = null;
        connectedWorkerId = message.workerId;
        for (const workerId of earlyAnnouncedWorkerIds) {
          handleWaitingBuild(workerId);
        }
        // An announcement may have come before this tab started.
        buildsBroadcastChannel.postMessage({
          type: "BuildWaitingRequest",
        } satisfies BuildWaitingRequest);
        // Last, so an app's evoluError listener that throws stops none of the
        // above.
        forward(message);
        break;
      }

      case "SharedWorkerUnsupported": {
        if (deps.onSharedWorkerUnsupported) {
          deps.onSharedWorkerUnsupported();
        } else {
          alert(
            "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
          );
        }
        break;
      }

      default:
        exhaustiveCheck(message);
    }
  };

  // Disposing the deps ends the DbWorkers this tab hosts, which releases their
  // database locks for the tab that takes over.
  const dbWorkers = new Set<Disposable>();
  disposer.defer(() => {
    for (const dbWorker of dbWorkers) dbWorker[Symbol.dispose]();
  });
  const createDbWorker: CreateDbWorker = () => {
    const nativeDbWorker = new Worker(
      new URL("Db.worker.js", import.meta.url),
      { type: "module" },
    );
    const worker = createWorker<DbWorkerInit, never>(nativeDbWorker);
    // The DbWorker posts one message once its script has loaded, and the init
    // waits for it, because a worker that never runs cannot refuse its
    // database, so the tab keeps the init's port to refuse it instead. Each
    // DbWorker has its own Run: disposing it aborts the wait, because the
    // SharedWorker then requests a replacement elsewhere, and a refusal posted
    // afterwards would refuse a database another tab serves.
    const dbWorkerRun = run.create();
    const loaded = dbWorkerRun.abortable(
      waitForWorkerLoad(
        nativeDbWorker,
        nativeDbWorker,
        "The DbWorker failed to load.",
      ),
    );

    const dbWorker: ReturnType<CreateDbWorker> = {
      ...worker,
      [Symbol.dispose]: () => {
        dbWorkers.delete(dbWorker);
        dbWorkerRun[Symbol.dispose]();
        worker[Symbol.dispose]();
      },
      postMessage: (init, transfer) => {
        void loaded.then((result) => {
          if (result.ok) {
            worker.postMessage(init, transfer);
            return;
          }
          if (result.error.type === "AbortError") return;
          createMessagePort(init.port).postMessage({
            type: "LeaderRefused",
            error: result.error,
          });
          dbWorker[Symbol.dispose]();
        });
      },
    };
    dbWorkers.add(dbWorker);
    return dbWorker;
  };

  const createStoredWorker = (): CommonSharedWorker => {
    const nativeSharedWorker = new SharedWorker(
      new URL("Shared.worker.js", import.meta.url),
      { type: "module" },
    );
    const worker = createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
      nativeSharedWorker,
    );
    let onMessage: ((message: SharedWorkerOutput) => void) | null = null;
    const receive = (
      message: SharedWorkerOutput | SharedWorkerUnsupported,
    ): void => {
      handleSharedWorkerMessage(message, (message) => {
        onMessage?.(message);
      });
    };
    // The stored worker lives as long as these deps, whose Run ends the wait.
    // As for a DbWorker, the failure is delivered outside the Run, so an
    // evoluError subscriber that throws cannot end the Run.
    void run
      .abortable(
        waitForWorkerLoad(
          // The one-tab polyfill exposes its dedicated Worker as the port.
          typeof nativeSharedWorker.addEventListener === "function"
            ? nativeSharedWorker
            : nativeSharedWorker.port,
          nativeSharedWorker.port,
          "The SharedWorker failed to load.",
        ),
      )
      .then((loaded) => {
        if (!loaded.ok && loaded.error.type !== "AbortError")
          receive({ type: "Error", error: loaded.error });
      });
    return {
      ...worker,
      port: {
        ...worker.port,
        get onMessage() {
          return onMessage;
        },
        set onMessage(fn) {
          onMessage = fn;
          worker.port.onMessage = fn ? receive : null;
        },
      },
    };
  };

  // A memory database belongs to its instance, so its worker and DbWorker
  // stay in this tab. Keep both the URL and options static for bundlers.
  const createMemoryInstanceWorker: CreateMemoryInstanceWorkerDep["createMemoryInstanceWorker"] =
    () => {
      const nativeWorker = new Worker(
        new URL("Shared.worker.js", import.meta.url),
        { type: "module", name: "evolu-memory-instance" },
      );
      const worker = createWorker<SharedWorkerInput, SharedWorkerOutput>(
        nativeWorker,
      );
      // Ending the instance disposes this Run, which stops the wait.
      const workerRun = run.create();
      void workerRun
        .abortable(
          waitForWorkerLoad(
            nativeWorker,
            nativeWorker,
            "The SharedWorker failed to load.",
          ),
        )
        .then((loaded) => {
          if (!loaded.ok && loaded.error.type !== "AbortError")
            worker.onMessage?.({ type: "Error", error: loaded.error });
        });
      return {
        port: worker,
        [Symbol.dispose]: () => {
          workerRun[Symbol.dispose]();
          worker[Symbol.dispose]();
        },
      };
    };

  const requestPersistentStorage = (): void => {
    if (isPersistentStorageRequested) return;
    isPersistentStorageRequested = true;
    void tryAsync(async () => {
      if (await navigator.storage.persisted()) return;
      await navigator.storage.persist();
    });
  };

  // Disposing the deps releases the locks this page holds through them, as
  // closing the page would, and a lock granted afterwards is released at once.
  // The SharedWorker learns that an Evolu instance ended when it gets the lock
  // the instance holds. Chrome keeps the locks of a page in its back-forward
  // cache, and a request made before the page entered the cache waits until
  // Chrome drops the page (https://issues.chromium.org/issues/567630881), so
  // the SharedWorker would keep syncing the owners of a cached tab's instances
  // and rerunning their queries.
  let areLocksReleased = false;
  const locksReleased = Promise.withResolvers<void>();
  disposer.defer(() => {
    areLocksReleased = true;
    locksReleased.resolve();
  });

  function requestLock<T>(
    name: string,
    callback: LockGrantedCallback<T>,
  ): Promise<Awaited<T>>;
  function requestLock<T>(
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<T>,
  ): Promise<Awaited<T>>;
  function requestLock(
    name: string,
    ...args:
      | [LockGrantedCallback<unknown>]
      | [LockOptions, LockGrantedCallback<unknown>]
  ): Promise<unknown> {
    const [options, callback] = args.length === 1 ? [{}, args[0]] : args;
    return navigator.locks.request(name, options, (lock) =>
      areLocksReleased
        ? undefined
        : Promise.race([callback(lock), locksReleased.promise]),
    );
  }

  const evoluDeps = disposer.use(
    createCommonEvoluDeps({
      requestPersistentStorage,
      ...deps,
      createDbWorker,
      createMemoryInstanceWorker,
      createBroadcastChannel,
      createMessageChannel,
      createStoredWorker,
      // Safari's Private Browsing and Firefox's private windows offer no OPFS,
      // and a browser may delete it, as Chrome's incognito does when the
      // session ends. The tab shares its workers' storage partition.
      getDevicePersistence: async () =>
        (await tryAsync(() => navigator.storage.getDirectory())).ok
          ? "Unknown"
          : "NotPersisted",
      lockManager: {
        query: () => navigator.locks.query(),
        request: requestLock,
      },
      reloadApp: reloadThisApp,
    }),
  );

  // A page entering the back-forward cache is frozen with its DbWorkers, and
  // WebKit keeps their database locks while the page is cached
  // (https://bugs.webkit.org/show_bug.cgi?id=316904), so the other tabs would
  // stall. WebKit also releases the page's own locks, so a restored page would
  // work with state the other tabs gave up on. The page therefore ends its part
  // as if it closed, and reloads when it is shown again.
  const reloadRestoredPage = (event: PageTransitionEvent): void => {
    if (event.persisted) reloadThisApp();
  };
  const handlePageHide = (event: PageTransitionEvent): void => {
    if (!event.persisted) return;
    addEventListener("pageshow", reloadRestoredPage, { once: true });
    disposables.dispose();
  };
  addEventListener("pagehide", handlePageHide);
  disposer.defer(() => {
    removeEventListener("pagehide", handlePageHide);
  });

  const disposables = disposer.move();

  return {
    ...evoluDeps,
    [Symbol.dispose]: () => {
      disposables.dispose();
    },
  };
};

/**
 * Waits for a worker's first message, which proves that its script loaded and
 * that it reports its own errors, and fails with the first error event before
 * it.
 *
 * A script that fails to load fires a plain Event
 * (https://html.spec.whatwg.org/multipage/workers.html#worker-processing-model),
 * and one that throws while it evaluates fires an ErrorEvent with the message
 * and position but without the error value
 * (https://html.spec.whatwg.org/multipage/webappapis.html#report-an-exception).
 * After the first message, a dedicated Worker still fires an ErrorEvent for
 * each runtime error the worker reports itself, so the Task stops listening
 * there. An ErrorEvent stays uncanceled, so the browser still logs it and
 * passes it to the page's own error handlers.
 */
const waitForWorkerLoad = (
  errorTarget: EventTarget,
  messageTarget: EventTarget,
  loadFailureMessage: string,
): Task<void, UnknownError> =>
  callback(({ resolve }) => {
    const handleMessage = (): void => {
      resolve(ok());
    };
    const handleError = (event: Event): void => {
      resolve(
        err(
          createUnknownError(
            event instanceof ErrorEvent
              ? {
                  message: event.message,
                  filename: event.filename,
                  lineno: event.lineno,
                  colno: event.colno,
                }
              : { message: loadFailureMessage },
          ),
        ),
      );
    };
    messageTarget.addEventListener("message", handleMessage);
    errorTarget.addEventListener("error", handleError);
    return () => {
      messageTarget.removeEventListener("message", handleMessage);
      errorTarget.removeEventListener("error", handleError);
    };
  });

// Marks, for the tab's session, that Evolu reloaded the page for another build.
const automaticReloadKey = "evolu:automatic-reload";
// Holds, for the tab's session, every waiting worker Evolu reloaded it for.
const reloadedForKey = "evolu:reloaded-for";

// Removes the mark, so only the page the reload loaded sees it.
const takeAutomaticReload = (): boolean => {
  const item = trySync(() => {
    const value = sessionStorage.getItem(automaticReloadKey);
    sessionStorage.removeItem(automaticReloadKey);
    return value;
  });
  return item.ok && item.value !== null;
};

const getReloadedForWorkerIds = (): ReadonlySet<string> => {
  const item = trySync(() => sessionStorage.getItem(reloadedForKey));
  return new Set(item.ok && item.value !== null ? item.value.split(",") : []);
};

const markAutomaticReload = (workerId: SharedWorkerId): boolean =>
  trySync(() => {
    const workerIds = new Set(
      sessionStorage.getItem(reloadedForKey)?.split(","),
    );
    workerIds.add(workerId);
    sessionStorage.setItem(reloadedForKey, [...workerIds].join(","));
    sessionStorage.setItem(automaticReloadKey, "1");
  }).ok;

// Holds, for the tab's session, every stored database version a refusal
// reloaded the page for. Each version reloads it once, so refusals of several
// databases cannot keep reloading it, and a build that refuses them again
// reports the error instead.
const refusalReloadKey = "evolu:refusal-reloads";

const getRefusalReloadVersions = (): ReadonlySet<string> => {
  const item = trySync(() => sessionStorage.getItem(refusalReloadKey));
  return new Set(item.ok && item.value !== null ? item.value.split(",") : []);
};

// Adds to the stored versions, which include those marked earlier in this page.
const markRefusalReload = (error: UnsupportedDbVersionError): boolean =>
  trySync(() => {
    const versions = new Set(
      sessionStorage.getItem(refusalReloadKey)?.split(","),
    );
    versions.add(String(error.storedVersion));
    sessionStorage.setItem(refusalReloadKey, [...versions].join(","));
  }).ok;
