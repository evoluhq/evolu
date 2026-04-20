/**
 * React Native implementation of {@link LockManager}.
 *
 * @module
 */

/**
 * React Native `LockManager` ponyfill.
 *
 * This is a temporary in-memory ponyfill until React Native ships native
 * `LockManager` support.
 *
 * The ponyfill follows Web Locks request and query semantics within the current
 * JavaScript process.
 *
 * ### Example
 *
 * ```ts
 * await lockManager.request("db", async () => {
 *   // critical section
 * });
 * ```
 */
const createLockManagerPonyfill = ({
  clientId = "in-memory-main-thread",
}: {
  readonly clientId?: string;
} = {}): LockManager => {
  const heldLocksByName = new Map<string, Array<HeldLock>>();
  const pendingRequestsByName = new Map<string, Array<PendingRequest<any>>>();

  const processPendingRequests = (name: string): void => {
    const pendingRequests = pendingRequestsByName.get(name);
    if (pendingRequests == null || pendingRequests.length === 0) return;

    const heldLocks = heldLocksByName.get(name) ?? [];
    const hasExclusiveLock = heldLocks.some(
      (lock) => lock.mode === "exclusive",
    );
    if (hasExclusiveLock) return;

    if (heldLocks.length === 0) {
      const nextRequest = pendingRequests[0];
      if (nextRequest.mode === "exclusive") {
        grantPendingRequest(name, pendingRequests.shift()!);
      } else {
        while (pendingRequests[0]?.mode === "shared") {
          grantPendingRequest(name, pendingRequests.shift()!);
        }
      }
    } else {
      while (pendingRequests[0]?.mode === "shared") {
        grantPendingRequest(name, pendingRequests.shift()!);
      }
    }

    cleanupNameState(name);
  };

  const grantPendingRequest = <T>(
    name: string,
    pendingRequest: PendingRequest<T>,
  ): void => {
    const heldLocks = heldLocksByName.get(name) ?? [];
    const heldLock = {
      clientId,
      mode: pendingRequest.mode,
      name,
      reject: pendingRequest.reject,
    } satisfies HeldLock;

    heldLocks.push(heldLock);
    heldLocksByName.set(name, heldLocks);
    pendingRequest.phase = "granted";

    void Promise.resolve()
      .then(() => {
        if (pendingRequest.signal?.aborted) {
          pendingRequest.phase = "settled";
          pendingRequest.signal.removeEventListener(
            "abort",
            pendingRequest.abort,
          );
          releaseHeldLock(name, heldLock);
          return;
        }

        pendingRequest.signal?.removeEventListener(
          "abort",
          pendingRequest.abort,
        );
        pendingRequest.phase = "running";

        return Promise.resolve(
          pendingRequest.callback({ mode: pendingRequest.mode, name }),
        );
      })
      .then(
        (value) => {
          if (pendingRequest.phase === "settled") return;

          pendingRequest.phase = "settled";
          releaseHeldLock(name, heldLock);
          pendingRequest.resolve(value!);
        },
        (error: unknown) => {
          pendingRequest.phase = "settled";
          releaseHeldLock(name, heldLock);
          pendingRequest.reject(error);
        },
      );
  };

  const releaseHeldLock = (name: string, heldLock: HeldLock): void => {
    const currentHeldLocks = heldLocksByName.get(name) ?? [];
    heldLocksByName.set(
      name,
      currentHeldLocks.filter((lock) => lock !== heldLock),
    );

    cleanupNameState(name);
    processPendingRequests(name);
  };

  const stealLocks = (name: string): void => {
    const heldLocks = heldLocksByName.get(name) ?? [];
    if (heldLocks.length === 0) return;

    heldLocksByName.delete(name);

    for (const heldLock of heldLocks) {
      heldLock.reject(createAbortError());
    }
  };

  const cleanupNameState = (name: string): void => {
    if (heldLocksByName.get(name)?.length === 0) {
      heldLocksByName.delete(name);
    }

    if (pendingRequestsByName.get(name)?.length === 0) {
      pendingRequestsByName.delete(name);
    }
  };

  const removePendingRequest = <T>(
    name: string,
    pendingRequest: PendingRequest<T>,
  ): void => {
    const pendingRequests = pendingRequestsByName.get(name)!;
    pendingRequestsByName.set(
      name,
      pendingRequests.filter((request) => request !== pendingRequest),
    );

    cleanupNameState(name);
    processPendingRequests(name);
  };

  const canGrantImmediately = (name: string, mode: LockMode): boolean => {
    const pendingRequests = pendingRequestsByName.get(name);
    if (pendingRequests != null && pendingRequests.length > 0) {
      return false;
    }

    const heldLocks = heldLocksByName.get(name) ?? [];

    if (mode === "exclusive") {
      return heldLocks.length === 0;
    }

    return heldLocks.every((lock) => lock.mode === "shared");
  };

  return {
    request: <T>(
      name: string,
      optionsOrCallback: RequestOptions | LockGrantedCallback<T>,
      maybeCallback?: LockGrantedCallback<T>,
    ): Promise<Awaited<T>> => {
      const [options, callback] = normalizeRequestArguments(
        optionsOrCallback,
        maybeCallback,
      );
      const mode = options.mode ?? "exclusive";

      if (name.startsWith("-")) {
        return Promise.reject(createNotSupportedError());
      }

      if (options.ifAvailable && options.steal) {
        return Promise.reject(createNotSupportedError());
      }

      if (options.steal && mode !== "exclusive") {
        return Promise.reject(createNotSupportedError());
      }

      if (options.signal != null && (options.ifAvailable || options.steal)) {
        return Promise.reject(createNotSupportedError());
      }

      if (options.signal?.aborted) {
        return Promise.reject(options.signal.reason as Error);
      }

      if (options.ifAvailable && !canGrantImmediately(name, mode)) {
        return Promise.resolve().then(() => Promise.resolve(callback(null)));
      }

      return new Promise<Awaited<T>>((resolve, reject) => {
        const pendingRequest: PendingRequest<T> = {
          abort: () => {
            if (pendingRequest.phase === "queued") {
              pendingRequest.phase = "settled";
              removePendingRequest(name, pendingRequest);
              reject(options.signal!.reason as Error);
              return;
            }

            pendingRequest.phase = "settled";
            reject(options.signal!.reason as Error);
          },
          callback,
          mode,
          name,
          phase: "queued",
          reject,
          resolve,
          ...(options.signal == null ? {} : { signal: options.signal }),
        };

        if (options.signal != null) {
          options.signal.addEventListener("abort", pendingRequest.abort, {
            once: true,
          });
        }

        const pendingRequests = pendingRequestsByName.get(name) ?? [];

        if (options.steal) {
          stealLocks(name);
          pendingRequests.unshift(pendingRequest);
        } else {
          pendingRequests.push(pendingRequest);
        }

        pendingRequestsByName.set(name, pendingRequests);
        processPendingRequests(name);
      });
    },

    query: () => {
      const held = Array.from(heldLocksByName.values())
        .flat()
        .map(({ clientId, mode, name }) => ({ clientId, mode, name }));
      const pending = Array.from(pendingRequestsByName.values())
        .flat()
        .map(({ mode, name }) => ({
          clientId,
          mode,
          name,
        }));

      return Promise.resolve({ held, pending });
    },
  };
};

/**
 * React Native {@link LockManager}.
 *
 * Uses an in-memory lock manager scoped to the main JavaScript thread while
 * following Web Locks request and query semantics.
 */
export const lockManager: LockManager = /*#__PURE__*/ createLockManagerPonyfill(
  {
    clientId: "react-native-main-thread",
  },
);

const normalizeRequestArguments = <T>(
  optionsOrCallback: RequestOptions | LockGrantedCallback<T>,
  maybeCallback?: LockGrantedCallback<T>,
): [RequestOptions, LockGrantedCallback<T>] =>
  typeof optionsOrCallback === "function"
    ? [{}, optionsOrCallback]
    : [optionsOrCallback, maybeCallback!];

const createAbortError = (): Error =>
  createNamedError("AbortError", "The request was aborted.");

const createNotSupportedError = (): Error =>
  createNamedError("NotSupportedError", "The operation is not supported.");

const createNamedError = (name: string, message: string): Error => {
  const error = new Error(message) as Error & { name: string };
  error.name = name;
  return error;
};

interface HeldLock extends LockInfo {
  readonly clientId: string;
  readonly mode: LockMode;
  readonly name: string;
  readonly reject: (reason?: unknown) => void;
}

interface RequestOptions {
  readonly ifAvailable?: boolean;
  readonly mode?: LockMode;
  readonly signal?: AbortSignal;
  readonly steal?: boolean;
}

interface PendingRequest<T> {
  readonly abort: () => void;
  readonly callback: LockGrantedCallback<T>;
  readonly mode: LockMode;
  readonly name: string;
  phase: "queued" | "granted" | "running" | "settled";
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: Awaited<T> | PromiseLike<Awaited<T>>) => void;
  readonly signal?: AbortSignal;
}
