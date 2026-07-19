import { assert, describe, expect, expectTypeOf, test } from "vitest";
import type { NonEmptyArray, NonEmptyReadonlyArray } from "../src/Array.ts";
import { lazyVoid } from "../src/Function.ts";
import {
  createSharedResourceByKeyWithClaims,
  createSharedResource,
  createSharedResourceByKey,
  type BorrowedResource,
  type ClaimLease,
  type Lease,
  type SharedResource,
  type SharedResourceByKey,
  type SharedResourceByKeyWithClaims,
} from "../src/Resource.ts";
import { err, ok } from "../src/Result.ts";
import {
  AbortError,
  createGate,
  runDisposedAbortReason,
  testAbortReason,
  testCreateRun,
  type Task,
} from "../src/Task.ts";
import { expectConditionAfterMicrotasks } from "./_vitest.ts";

/** Creates a fresh Disposable per create call and records lifecycle counts. */
const createTestResources = () => {
  let createCount = 0;
  let disposeCount = 0;
  const disposedWaiters: Array<() => void> = [];

  const create: Task<Disposable> = () => {
    createCount++;
    return ok({
      [Symbol.dispose]: () => {
        disposeCount++;
        for (const resolve of disposedWaiters.splice(0)) resolve();
      },
    });
  };

  return {
    create,
    getCreateCount: () => createCount,
    getDisposeCount: () => disposeCount,
    nextDisposed: () =>
      new Promise<void>((resolve) => disposedWaiters.push(resolve)),
  };
};

const idleMutexSnapshot = {
  policy: "fifo",
  permits: 1,
  taken: 0,
  waiters: [],
  available: 1,
  isIdle: true,
};

describe("BorrowedResource", () => {
  test("preserves resource unions", () => {
    interface SyncResource extends Disposable {
      readonly type: "sync";
      readonly sync: () => void;
    }
    interface AsyncResource extends AsyncDisposable {
      readonly type: "async";
      readonly async: () => void;
    }

    expectTypeOf<
      BorrowedResource<SyncResource | AsyncResource>
    >().toEqualTypeOf<
      | { readonly type: "sync"; readonly sync: () => void }
      | { readonly type: "async"; readonly async: () => void }
    >();
  });
});

describe("SharedResource", () => {
  describe("acquire", () => {
    test("lazily creates the resource", async () => {
      await using run = testCreateRun();

      let createCount = 0;
      const resource: Disposable = { [Symbol.dispose]: lazyVoid };

      await using sharedResource = await run.ok(
        createSharedResource(() => {
          createCount++;
          return ok(resource);
        }),
      );

      expect(createCount).toBe(0);

      const lease = await run.ok(sharedResource.acquire);

      expect(createCount).toBe(1);
      expect(lease.resource).toBe(resource);
    });

    test("reuses the current resource while a lease is held", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);
      const second = await run.ok(sharedResource.acquire);

      expect(resources.getCreateCount()).toBe(1);
      expect(second.resource).toBe(first.resource);
    });

    test("reports whether acquire created the resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);
      const second = await run.ok(sharedResource.acquire);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
    });

    test("creates a fresh resource after disposal", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);
      const firstResource = first.resource;
      const disposed = resources.nextDisposed();
      first.release();
      await disposed;

      const second = await run.ok(sharedResource.acquire);

      expect(resources.getCreateCount()).toBe(2);
      expect(second.resource).not.toBe(firstResource);
    });

    test("waits for async resource disposal", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      let createCount = 0;
      const create: Task<AsyncDisposable> = () => {
        createCount++;
        return ok({
          [Symbol.asyncDispose]: async () => {
            disposalStarted.resolve();
            await continueDisposal.promise;
          },
        });
      };

      await using sharedResource = await run.ok(createSharedResource(create));

      const first = await run.ok(sharedResource.acquire);
      first.release();
      await disposalStarted.promise;

      const second = run.ok(sharedResource.acquire);

      expect(createCount).toBe(1);

      continueDisposal.resolve();
      await second;

      expect(createCount).toBe(2);
    });

    test("serializes concurrent first calls so create runs once", async () => {
      await using run = testCreateRun();
      const gate = createGate();

      let createCount = 0;
      const resource: Disposable = { [Symbol.dispose]: lazyVoid };
      const create: Task<Disposable> = async (run) => {
        createCount++;
        await run.ok(gate.wait);
        return ok(resource);
      };

      await using sharedResource = await run.ok(createSharedResource(create));

      const first = run.ok(sharedResource.acquire);
      const second = run.ok(sharedResource.acquire);
      gate.open();
      const [firstLease, secondLease] = await Promise.all([first, second]);

      expect(createCount).toBe(1);
      expect(firstLease.resource).toBe(resource);
      expect(secondLease.resource).toBe(resource);
    });

    test("runs to completion when the caller aborts its Fiber", async () => {
      await using run = testCreateRun();
      const gate = createGate();

      const resource: Disposable = { [Symbol.dispose]: lazyVoid };
      const create: Task<Disposable> = async (run) => {
        await run.ok(gate.wait);
        return ok(resource);
      };

      await using sharedResource = await run.ok(createSharedResource(create));

      const fiber = run.abortable(sharedResource.acquire);
      fiber.abort(testAbortReason);
      gate.open();

      const result = await fiber;

      assert(result.ok);
      expect(result.value.resource).toBe(resource);
      expect(sharedResource.snapshot().leaseCount).toBe(1);
    });

    test("overprovided acquire deps do not replace deps captured for create", async () => {
      await using run = testCreateRun();

      interface TestResource extends Disposable {
        readonly value: string;
      }
      interface TestDep {
        readonly value: string;
      }

      await using sharedResource = await run.ok(
        createSharedResource<TestResource, TestDep>(({ deps }) =>
          ok({ value: deps.value, [Symbol.dispose]: lazyVoid }),
        ),
        { value: "captured" },
      );

      const lease = await run.ok(sharedResource.acquire, {
        value: "replacement",
      });

      expect(lease.resource.value).toBe("captured");
    });
  });

  describe("acquireCurrent", () => {
    test("returns undefined without creating a resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const lease = await run.ok(sharedResource.acquireCurrent);

      expect(lease).toBeUndefined();
      expect(resources.getCreateCount()).toBe(0);
    });

    test("waits for in-flight creation and acquires the new resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const gate = createGate();

      await using sharedResource = await run.ok(
        createSharedResource(async (run) => {
          await run.ok(gate.wait);
          return run(resources.create);
        }),
      );

      const first = run.ok(sharedResource.acquire);
      const current = run.ok(sharedResource.acquireCurrent);
      gate.open();

      const firstLease = await first;
      const currentLease = await current;

      expect(currentLease?.resource).toBe(firstLease.resource);
      expect(currentLease?.created).toBe(false);
      expect(resources.getCreateCount()).toBe(1);
    });

    test("waits for in-flight disposal and returns undefined", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      await using sharedResource = await run.ok(
        createSharedResource(() =>
          ok({
            [Symbol.asyncDispose]: async () => {
              disposalStarted.resolve();
              await continueDisposal.promise;
            },
          }),
        ),
      );

      const lease = await run.ok(sharedResource.acquire);
      lease.release();
      await disposalStarted.promise;

      const current = run.ok(sharedResource.acquireCurrent);
      expect(sharedResource.snapshot().mutex.waiters).toEqual([{ permits: 1 }]);
      continueDisposal.resolve();

      expect(await current).toBeUndefined();
    });

    test("acquires the current resource without creating another", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);
      const current = await run.ok(sharedResource.acquireCurrent);

      expect(current?.resource).toBe(first.resource);
      expect(current?.created).toBe(false);
      expect(resources.getCreateCount()).toBe(1);
    });

    test("cancels pending idle disposal and acquires the current resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, { idleDisposeAfter: "3s" }),
      );

      const first = await run.ok(sharedResource.acquire);
      first.release();

      const current = await run.ok(sharedResource.acquireCurrent);

      expect(current?.resource).toBe(first.resource);
      expect(sharedResource.snapshot().idleDisposePending).toBe(false);

      run.deps.time.advance("3s");
      expect(resources.getDisposeCount()).toBe(0);
    });
  });

  describe("use", () => {
    test("creates the resource and releases its lease after the Task settles", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      let leaseCountDuringUse: number | undefined;
      let createdDuringUse: boolean | undefined;

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const value = await run.ok(
        sharedResource.use((_resource, created) => () => {
          leaseCountDuringUse = sharedResource.snapshot().leaseCount;
          createdDuringUse = created;
          return ok("used" as const);
        }),
      );

      expect(value).toBe("used");
      expect(createdDuringUse).toBe(true);
      expect(leaseCountDuringUse).toBe(1);
      expect(sharedResource.snapshot().leaseCount).toBe(0);
    });

    test("reports created false while reusing a held resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      let createdDuringUse: boolean | undefined;

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      using _lease = await run.ok(sharedResource.acquire);

      await run.ok(
        sharedResource.use((_resource, created) => () => {
          createdDuringUse = created;
          return ok();
        }),
      );

      expect(createdDuringUse).toBe(false);
      expect(resources.getCreateCount()).toBe(1);
      expect(sharedResource.snapshot().leaseCount).toBe(1);
    });

    test("releases its lease when the callback Task aborts", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const callbackStarted = Promise.withResolvers<void>();
      const gate = createGate();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      const disposed = resources.nextDisposed();

      const fiber = run.abortable(
        sharedResource.use(() => async (run) => {
          callbackStarted.resolve();
          await run.ok(gate.wait);
          return ok();
        }),
      );
      await callbackStarted.promise;

      expect(sharedResource.snapshot().leaseCount).toBe(1);

      fiber.abort(testAbortReason);
      const result = await fiber;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(testAbortReason);

      await disposed;
      expect(sharedResource.snapshot().leaseCount).toBe(0);
      expect(resources.getDisposeCount()).toBe(1);
    });
  });

  describe("Lease", () => {
    test("release disposes the resource after the last lease", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const lease = await run.ok(sharedResource.acquire);
      const disposed = resources.nextDisposed();

      expect(lease.release()).toBe(true);
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
      expect(sharedResource.snapshot().hasResource).toBe(false);
      expect(sharedResource.snapshot().idleDisposePending).toBe(false);
    });

    test("release keeps the resource while other leases remain", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);
      await run.ok(sharedResource.acquire);

      expect(first.release()).toBe(true);

      expect(resources.getDisposeCount()).toBe(0);
      expect(sharedResource.snapshot().hasResource).toBe(true);
      expect(sharedResource.snapshot().leaseCount).toBe(1);
    });

    test("release is idempotent and returns false after the first call", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);
      await run.ok(sharedResource.acquire);

      expect(first.release()).toBe(true);
      expect(first.release()).toBe(false);

      // Double release must not release the remaining lease's hold.
      expect(sharedResource.snapshot().leaseCount).toBe(1);
      expect(resources.getDisposeCount()).toBe(0);
    });

    test("release remains safe after root Run disposal", async () => {
      const run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      const lease = await run.ok(sharedResource.acquire);

      await run[Symbol.asyncDispose]();

      expect(lease.release()).toBe(false);
      expect(lease.release()).toBe(false);
    });

    test("Symbol.dispose releases it", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const disposed = resources.nextDisposed();

      {
        using _ = await run.ok(sharedResource.acquire);
        expect(sharedResource.snapshot().leaseCount).toBe(1);
      }

      await disposed;
      expect(resources.getDisposeCount()).toBe(1);
    });
  });

  describe("idleDisposeAfter", () => {
    test("delays disposal after the last release", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, { idleDisposeAfter: "3s" }),
      );

      const lease = await run.ok(sharedResource.acquire);

      expect(lease.release()).toBe(true);
      expect(resources.getDisposeCount()).toBe(0);
      expect(sharedResource.snapshot().idleDisposePending).toBe(true);

      const disposed = resources.nextDisposed();
      run.deps.time.advance("3s");
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
      expect(sharedResource.snapshot().hasResource).toBe(false);
    });

    test("reuses the current resource when acquired before disposal", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, { idleDisposeAfter: "3s" }),
      );

      const first = await run.ok(sharedResource.acquire);
      first.release();
      expect(sharedResource.snapshot().idleDisposePending).toBe(true);

      const second = await run.ok(sharedResource.acquire);

      expect(sharedResource.snapshot().idleDisposePending).toBe(false);
      expect(resources.getCreateCount()).toBe(1);
      expect(second.resource).toBe(first.resource);

      run.deps.time.advance("3s");
      expect(resources.getDisposeCount()).toBe(0);
    });

    test("restarts the idle delay after reacquisition and release", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, { idleDisposeAfter: "3s" }),
      );

      const first = await run.ok(sharedResource.acquire);
      first.release();
      run.deps.time.advance("2s");

      const second = await run.ok(sharedResource.acquire);
      second.release();
      run.deps.time.advance("1s");

      expect(resources.getDisposeCount()).toBe(0);
      expect(sharedResource.snapshot().idleDisposePending).toBe(true);

      const disposed = resources.nextDisposed();
      run.deps.time.advance("2s");
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("creates a fresh resource when acquired after the timer elapses", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      let createCount = 0;
      const create: Task<AsyncDisposable & { readonly id: number }> = () => {
        const id = ++createCount;
        return ok({
          id,
          [Symbol.asyncDispose]: async () => {
            if (id !== 1) return;
            disposalStarted.resolve();
            await continueDisposal.promise;
          },
        });
      };

      await using sharedResource = await run.ok(
        createSharedResource(create, { idleDisposeAfter: "3s" }),
      );

      const first = await run.ok(sharedResource.acquire);
      first.release();
      run.deps.time.advance("3s");
      await disposalStarted.promise;

      const second = run.ok(sharedResource.acquire);
      expect(createCount).toBe(1);

      continueDisposal.resolve();
      const secondLease = await second;

      expect(createCount).toBe(2);
      expect(secondLease.resource).not.toBe(first.resource);
    });
  });

  describe("snapshot", () => {
    test("reports shared resource state", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, { idleDisposeAfter: "3s" }),
      );

      expect(sharedResource.snapshot()).toEqual({
        isIdle: true,
        leaseCount: 0,
        hasResource: false,
        idleDisposePending: false,
        mutex: idleMutexSnapshot,
      });

      const lease = await run.ok(sharedResource.acquire);

      expect(sharedResource.snapshot()).toEqual({
        isIdle: false,
        leaseCount: 1,
        hasResource: true,
        idleDisposePending: false,
        mutex: idleMutexSnapshot,
      });

      lease.release();

      expect(sharedResource.snapshot()).toEqual({
        isIdle: false,
        leaseCount: 0,
        hasResource: true,
        idleDisposePending: true,
        mutex: idleMutexSnapshot,
      });
    });

    test("reports immediate disposal in progress", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const lease = await run.ok(sharedResource.acquire);
      const disposed = resources.nextDisposed();
      lease.release();

      expect(sharedResource.snapshot()).toEqual({
        isIdle: false,
        leaseCount: 0,
        hasResource: true,
        idleDisposePending: false,
        mutex: {
          policy: "fifo",
          permits: 1,
          taken: 1,
          waiters: [],
          available: 0,
          isIdle: false,
        },
      });

      await disposed;
    });

    test("reports not idle while creating the first resource", async () => {
      await using run = testCreateRun();
      const gate = createGate();

      await using sharedResource = await run.ok(
        createSharedResource(async (run) => {
          await run.ok(gate.wait);
          return ok({ [Symbol.dispose]: lazyVoid });
        }),
      );

      const acquire = run.ok(sharedResource.acquire);
      const isIdleWhileCreating = sharedResource.snapshot().isIdle;
      gate.open();
      await acquire;

      expect(isIdleWhileCreating).toBe(false);
    });

    test("reports mutex waiters during a contended acquire", async () => {
      await using run = testCreateRun();
      const gate = createGate();

      await using sharedResource = await run.ok(
        createSharedResource(async (run) => {
          await run.ok(gate.wait);
          return ok({ [Symbol.dispose]: lazyVoid });
        }),
      );

      const first = run.ok(sharedResource.acquire);
      const second = run.ok(sharedResource.acquire);
      const mutexWhileContended = sharedResource.snapshot().mutex;
      gate.open();
      await Promise.all([first, second]);

      expect(mutexWhileContended.waiters).toEqual([{ permits: 1 }]);
    });
  });

  describe("onDisposed", () => {
    test("does not call onDisposed when disposed before resource creation", async () => {
      await using run = testCreateRun();
      let onDisposedCallCount = 0;

      const sharedResource = await run.ok(
        createSharedResource(createTestResources().create, {
          onDisposed: () => {
            onDisposedCallCount++;
          },
        }),
      );

      await sharedResource[Symbol.asyncDispose]();

      expect(onDisposedCallCount).toBe(0);
    });

    test("calls onDisposed during owner disposal", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      let disposeCountAtCallback: number | undefined;

      const sharedResource = await run.ok(
        createSharedResource(resources.create, {
          onDisposed: () => {
            disposeCountAtCallback = resources.getDisposeCount();
          },
        }),
      );
      await run.ok(sharedResource.acquire);

      await sharedResource[Symbol.asyncDispose]();

      expect(disposeCountAtCallback).toBe(1);
    });

    test("runs after the resource is disposed and cleared", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const onDisposedCalled = Promise.withResolvers<void>();

      let stateAtCallback:
        { disposeCount: number; hasResource: boolean } | undefined;

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, {
          onDisposed: () => {
            stateAtCallback = {
              disposeCount: resources.getDisposeCount(),
              hasResource: sharedResource.snapshot().hasResource,
            };
            onDisposedCalled.resolve();
          },
        }),
      );

      const lease = await run.ok(sharedResource.acquire);
      lease.release();
      await onDisposedCalled.promise;

      expect(stateAtCallback).toEqual({ disposeCount: 1, hasResource: false });
    });

    test("runs after delayed idle disposal", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const onDisposedCalled = Promise.withResolvers<void>();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, {
          idleDisposeAfter: "3s",
          onDisposed: onDisposedCalled.resolve,
        }),
      );

      const lease = await run.ok(sharedResource.acquire);
      lease.release();

      expect(resources.getDisposeCount()).toBe(0);

      run.deps.time.advance("3s");
      await onDisposedCalled.promise;

      expect(resources.getDisposeCount()).toBe(1);
      expect(sharedResource.snapshot().hasResource).toBe(false);
    });
  });

  describe("disposal", () => {
    test("aborts acquire queued on the mutex when the owner is disposed", async () => {
      await using run = testCreateRun();
      const createStarted = Promise.withResolvers<void>();
      const gate = createGate();

      const sharedResource = await run.ok(
        createSharedResource(async (run) => {
          createStarted.resolve();
          await run.ok(gate.wait);
          return ok({ [Symbol.dispose]: lazyVoid });
        }),
      );

      const first = run.abortable(sharedResource.acquire);
      await createStarted.promise;

      const queued = run.abortable(sharedResource.acquire);
      expect(sharedResource.snapshot().mutex.waiters).toEqual([{ permits: 1 }]);

      const disposal = sharedResource[Symbol.asyncDispose]();
      const result = await queued;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(runDisposedAbortReason);

      gate.open();
      await first;
      await disposal;
    });

    test("aborts acquire when the owner is disposed during creation", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const createStarted = Promise.withResolvers<void>();
      const continueCreate = Promise.withResolvers<void>();

      const sharedResource = await run.ok(
        createSharedResource(async (run) => {
          const resource = await run.ok(resources.create);
          createStarted.resolve();
          await continueCreate.promise;
          return ok(resource);
        }),
      );

      const acquire = run.abortable(sharedResource.acquire);
      await createStarted.promise;

      const disposal = sharedResource[Symbol.asyncDispose]();
      continueCreate.resolve();

      const result = await acquire;
      await disposal;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(runDisposedAbortReason);
      expect(resources.getCreateCount()).toBe(1);
      expect(resources.getDisposeCount()).toBe(1);
    });

    test("disposes the current resource and releases held leases", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      const lease = await run.ok(sharedResource.acquire);

      await sharedResource[Symbol.asyncDispose]();

      expect(resources.getDisposeCount()).toBe(1);
      expect(lease.release()).toBe(false);
      expect(sharedResource.snapshot().hasResource).toBe(false);
    });

    test("clears pending idle disposal state", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResource = await run.ok(
        createSharedResource(resources.create, { idleDisposeAfter: "3s" }),
      );
      const lease = await run.ok(sharedResource.acquire);
      lease.release();

      expect(sharedResource.snapshot().idleDisposePending).toBe(true);

      await sharedResource[Symbol.asyncDispose]();

      expect(resources.getDisposeCount()).toBe(1);
      expect(sharedResource.snapshot()).toMatchObject({
        isIdle: true,
        idleDisposePending: false,
      });
    });

    test("awaits async resource disposal", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      const sharedResource = await run.ok(
        createSharedResource(() =>
          ok({
            [Symbol.asyncDispose]: async () => {
              disposalStarted.resolve();
              await continueDisposal.promise;
            },
          }),
        ),
      );
      await run.ok(sharedResource.acquire);

      let disposalSettled = false;
      const disposal = sharedResource[Symbol.asyncDispose]().then(() => {
        disposalSettled = true;
      });
      await disposalStarted.promise;

      expect(disposalSettled).toBe(false);

      continueDisposal.resolve();
      await disposal;

      expect(disposalSettled).toBe(true);
    });

    test("root Run disposal awaits current resource disposal", async () => {
      const run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      const sharedResource = await run.ok(
        createSharedResource(() =>
          ok({
            [Symbol.asyncDispose]: async () => {
              disposalStarted.resolve();
              await continueDisposal.promise;
            },
          }),
        ),
      );
      await run.ok(sharedResource.acquire);

      let rootDisposalSettled = false;
      const rootDisposal = run[Symbol.asyncDispose]().then(() => {
        rootDisposalSettled = true;
      });

      try {
        const firstSettled = await Promise.race([
          disposalStarted.promise.then(() => "resourceDisposalStarted"),
          rootDisposal.then(() => "rootDisposalSettled"),
        ]);

        expect(firstSettled).toBe("resourceDisposalStarted");
        expect(rootDisposalSettled).toBe(false);

        continueDisposal.resolve();
        await rootDisposal;

        expect(sharedResource.snapshot().hasResource).toBe(false);
        expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([]);
      } finally {
        continueDisposal.resolve();
        await sharedResource[Symbol.asyncDispose]();
        await rootDisposal;
      }
    });

    test("allows late lease release as a safe no-op", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      const lease = await run.ok(sharedResource.acquire);

      const disposal = sharedResource[Symbol.asyncDispose]();
      expect(lease.release()).toBe(true);
      await disposal;

      expect(resources.getDisposeCount()).toBe(1);
      expect(lease.release()).toBe(false);
    });

    test("owner disposal can drain a transferred lease before the caller awaits it", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      const acquire = run.ok(sharedResource.acquire);

      await expectConditionAfterMicrotasks(
        () => sharedResource.snapshot().leaseCount === 1,
        10,
      );
      await sharedResource[Symbol.asyncDispose]();

      const lease = await acquire;

      expect(sharedResource.snapshot().leaseCount).toBe(0);
      expect(resources.getDisposeCount()).toBe(1);
      expect(lease.release()).toBe(false);
    });

    test("skips scheduled disposal when a new lease arrives", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const first = await run.ok(sharedResource.acquire);

      // Take the mutex before release so the scheduled disposal queues behind
      // the second acquire.
      const second = run.ok(sharedResource.acquire);
      first.release();
      const secondLease = await second;

      // The mutex is FIFO, so a third acquire completes only after the queued
      // disposal task ran.
      await run.ok(sharedResource.acquire);

      expect(resources.getDisposeCount()).toBe(0);
      expect(secondLease.resource).toBe(first.resource);
    });
  });

  describe("leak detection", () => {
    test("warns when an undisposed SharedResource is garbage-collected", async () => {
      await using run = testCreateRun();

      await run.ok(createSharedResource(createTestResources().create));

      expect(run.deps.leakDetector.collect()).toBe(1);

      const entries = run.deps.console.getEntriesSnapshot();
      expect(entries).toHaveLength(1);
      expect(entries[0].method).toBe("warn");
      expect(entries[0].args[0]).toBe(
        "SharedResource was garbage-collected without cleanup. Tracked at:",
      );
    });

    test("warns when a leaked lease is garbage-collected", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      // Acquired but never released — a leak.
      await run.ok(sharedResource.acquire);

      expect(run.deps.leakDetector.collect()).toBe(2);

      const entries = run.deps.console.getEntriesSnapshot();
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(
        expect.objectContaining({
          method: "warn",
          args: expect.arrayContaining([
            "Lease was garbage-collected without cleanup. Tracked at:",
          ]),
        }),
      );
    });

    test("release untracks the lease", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      const lease = await run.ok(sharedResource.acquire);

      expect(run.deps.leakDetector.getTrackedCount({ name: "Lease" })).toBe(1);

      lease.release();

      expect(run.deps.leakDetector.getTrackedCount({ name: "Lease" })).toBe(0);
    });

    test("disposal untracks held leases", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResource = await run.ok(
        createSharedResource(resources.create),
      );

      await run.ok(sharedResource.acquire);
      expect(run.deps.leakDetector.getTrackedCount({ name: "Lease" })).toBe(1);

      await sharedResource[Symbol.asyncDispose]();

      expect(run.deps.leakDetector.getTrackedCount({ name: "Lease" })).toBe(0);
      expect(run.deps.console.getEntriesSnapshot()).toEqual([]);
    });
  });

  describe("defects", () => {
    test("acquire after disposal is a programmer error", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResource = await run.ok(
        createSharedResource(resources.create),
      );
      await sharedResource[Symbol.asyncDispose]();

      const result = await run.abortable(sharedResource.acquire);

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBeInstanceOf(Error);
      expect((result.error.reason.defect as Error).message).toBe(
        "Cannot use a disposed object.",
      );
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing create Task panics the Run tree", async () => {
      await using run = testCreateRun();
      const defect = new Error("create failed");

      await using sharedResource = await run.ok(
        createSharedResource(() => {
          throw defect;
        }),
      );

      const result = await run.abortable(sharedResource.acquire);

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing onDisposed after the last release panics the Run tree", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const defect = new Error("onDisposed failed");

      await using sharedResource = await run.ok(
        createSharedResource(resources.create, {
          onDisposed: () => {
            throw defect;
          },
        }),
      );

      const lease = await run.ok(sharedResource.acquire);
      lease.release();

      // Disposal runs on a fire-and-forget Fiber, so the defect is observable
      // only via panic reporting.
      const abortError = await run.deps.reportDefect.next();
      assert(AbortError.is(abortError));
      assert(abortError.reason.type === "PanicAbortReason");
      expect(abortError.reason.defect).toBe(defect);
    });

    test("throwing onDisposed during disposal reports once and rejects with AbortError", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const defect = new Error("onDisposed failed");

      const sharedResource = await run.ok(
        createSharedResource(resources.create, {
          onDisposed: () => {
            throw defect;
          },
        }),
      );

      await run.ok(sharedResource.acquire);

      let disposalError: unknown;
      try {
        await sharedResource[Symbol.asyncDispose]();
      } catch (error) {
        disposalError = error;
      }

      assert(AbortError.is(disposalError));
      assert(disposalError.reason.type === "PanicAbortReason");
      expect(disposalError.reason.defect).toBe(defect);
      expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([
        disposalError,
      ]);
    });

    test("throwing resource disposer panics the Run tree", async () => {
      await using run = testCreateRun();
      const defect = new Error("dispose failed");

      await using sharedResource = await run.ok(
        createSharedResource(() =>
          ok({
            [Symbol.dispose]: () => {
              throw defect;
            },
          }),
        ),
      );

      const lease = await run.ok(sharedResource.acquire);
      lease.release();

      const abortError = await run.deps.reportDefect.next();
      assert(AbortError.is(abortError));
      assert(abortError.reason.type === "PanicAbortReason");
      expect(abortError.reason.defect).toBe(defect);
    });
  });

  describe("types", () => {
    test("keyed acquire does not require captured deps", () => {
      interface TestDb extends Disposable {
        readonly query: () => string;
      }
      interface TestDep {
        readonly value: string;
      }

      expectTypeOf<SharedResource<TestDb>["acquire"]>().toEqualTypeOf<
        Task<Lease<TestDb>>
      >();

      const _sharedResource = createSharedResource((() =>
        ok({ [Symbol.dispose]: lazyVoid })) as Task<
        Disposable,
        never,
        TestDep
      >);
      expectTypeOf(_sharedResource).toEqualTypeOf<
        Task<SharedResource<Disposable>, never, TestDep>
      >();

      // @ts-expect-error - create Task must not fail.
      createSharedResource(() => err({ type: "CreateError" }));
    });

    test("acquireCurrent and use preserve their Task types", async () => {
      await using run = testCreateRun();

      interface TestDb extends Disposable {
        readonly query: () => string;
      }
      interface TestError {
        readonly type: "TestError";
      }
      interface TestDep {
        readonly value: string;
      }

      const create: Task<TestDb> = () =>
        ok({ query: () => "result", [Symbol.dispose]: lazyVoid });

      await using sharedResource = await run.ok(createSharedResource(create));

      expectTypeOf(sharedResource.acquireCurrent).toEqualTypeOf<
        Task<Lease<TestDb> | undefined>
      >();

      const use = sharedResource.use(
        (): Task<"used", TestError, TestDep> => () =>
          err({ type: "TestError" }),
      );
      expectTypeOf(use).toEqualTypeOf<Task<"used", TestError, TestDep>>();
    });
  });
});

describe("SharedResourceByKey", () => {
  describe("acquire", () => {
    test("lazily creates a resource per key", async () => {
      await using run = testCreateRun();

      const createCountsByKey = new Map<string, number>();
      const create =
        (key: string): Task<Disposable> =>
        () => {
          createCountsByKey.set(key, (createCountsByKey.get(key) ?? 0) + 1);
          return ok({ [Symbol.dispose]: lazyVoid });
        };

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(create),
      );

      expect(createCountsByKey.size).toBe(0);

      const first = await run.ok(sharedResourceByKey.acquire("a"));
      const second = await run.ok(sharedResourceByKey.acquire("a"));

      expect(createCountsByKey.get("a")).toBe(1);
      expect(second.resource).toBe(first.resource);
    });

    test("serializes concurrent first acquires for the same key", async () => {
      await using run = testCreateRun();
      const gate = createGate();

      let createCount = 0;
      const create = (): Task<Disposable> => async (run) => {
        createCount++;
        await run.ok(gate.wait);
        return ok({ [Symbol.dispose]: lazyVoid });
      };

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(create),
      );

      const first = run.ok(sharedResourceByKey.acquire("a"));
      const second = run.ok(sharedResourceByKey.acquire("a"));
      gate.open();
      const [firstLease, secondLease] = await Promise.all([first, second]);

      expect(createCount).toBe(1);
      expect(secondLease.resource).toBe(firstLease.resource);
    });

    test("creates independent resources for different keys", async () => {
      await using run = testCreateRun();

      const resourcesByKey = new Map<
        string,
        ReturnType<typeof createTestResources>
      >();
      const create = (key: string): Task<Disposable> => {
        const resources = createTestResources();
        resourcesByKey.set(key, resources);
        return resources.create;
      };

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(create),
      );

      const a = await run.ok(sharedResourceByKey.acquire("a"));
      const b = await run.ok(sharedResourceByKey.acquire("b"));

      expect(b.resource).not.toBe(a.resource);

      // Releasing "a" disposes only "a".
      const aDisposed = resourcesByKey.get("a")!.nextDisposed();
      a.release();
      await aDisposed;

      expect(resourcesByKey.get("a")!.getDisposeCount()).toBe(1);
      expect(resourcesByKey.get("b")!.getDisposeCount()).toBe(0);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("b")?.hasResource,
      ).toBe(true);
    });

    test("allows different keys to progress concurrently", async () => {
      await using run = testCreateRun();
      const gate = createGate();

      const create =
        (key: string): Task<Disposable> =>
        async (run) => {
          if (key === "a") await run.ok(gate.wait);
          return ok({ [Symbol.dispose]: lazyVoid });
        };

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(create),
      );

      const a = run.ok(sharedResourceByKey.acquire("a"));
      await run.ok(sharedResourceByKey.acquire("b"));

      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("b")?.hasResource,
      ).toBe(true);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.hasResource,
      ).toBe(false);

      gate.open();
      await a;
    });

    test("runs to completion after caller abort while waiting for a key", async () => {
      await using run = testCreateRun();
      const gate = createGate();
      const resources = createTestResources();

      const create: Task<Disposable> = async (run) => {
        await run.ok(gate.wait);
        return run(resources.create);
      };

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => create),
      );

      const first = run.ok(sharedResourceByKey.acquire("a"));
      const second = run.abortable(sharedResourceByKey.acquire("a"));
      second.abort(testAbortReason);
      gate.open();

      const firstLease = await first;
      const result = await second;

      assert(result.ok);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount,
      ).toBe(2);

      expect(firstLease.release()).toBe(true);
      expect(resources.getDisposeCount()).toBe(0);

      const disposed = resources.nextDisposed();
      expect(result.value.release()).toBe(true);
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });
  });

  describe("key removal", () => {
    test("disposes the resource and removes the key after the last lease", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const onDisposedCalled = Promise.withResolvers<void>();
      let hasKeyWhenDisposed: boolean | undefined;

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create, {
          onDisposed: () => {
            hasKeyWhenDisposed = sharedResourceByKey
              .snapshot()
              .resourcesByKey.has("a");
            onDisposedCalled.resolve();
          },
        }),
      );

      const lease = await run.ok(sharedResourceByKey.acquire("a"));
      lease.release();
      await onDisposedCalled.promise;

      expect(hasKeyWhenDisposed).toBe(false);
      expect(resources.getDisposeCount()).toBe(1);

      // The key was removed before onDisposed, so this acquire creates a fresh
      // resource.
      const again = await run.ok(sharedResourceByKey.acquire("a"));

      expect(resources.getCreateCount()).toBe(2);
      expect(again.resource).not.toBe(lease.resource);
      expect(sharedResourceByKey.snapshot().resourcesByKey.size).toBe(1);
    });

    test("removes the key when acquireCurrent waits for its resource disposal", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(
          () => () =>
            ok({
              [Symbol.asyncDispose]: async () => {
                disposalStarted.resolve();
                await continueDisposal.promise;
              },
            }),
        ),
      );

      const lease = await run.ok(sharedResourceByKey.acquire("a"));
      lease.release();
      await disposalStarted.promise;

      const current = run.ok(sharedResourceByKey.acquireCurrent("a"));
      await expectConditionAfterMicrotasks(
        () =>
          sharedResourceByKey.snapshot().resourcesByKey.get("a")?.mutex.waiters
            .length === 1,
        5,
      );
      continueDisposal.resolve();

      expect(await current).toBeUndefined();
      expect(sharedResourceByKey.snapshot().resourcesByKey.has("a")).toBe(
        false,
      );
    });

    test("keeps the key when its resource is reacquired before removal", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );

      const first = await run.ok(sharedResourceByKey.acquire("a"));

      // Take the outer key mutex before release so synchronous key removal
      // leaves the SharedResource registered for this acquire.
      const second = run.ok(sharedResourceByKey.acquire("a"));
      first.release();
      const secondLease = await second;

      // Later acquires reuse the same keyed SharedResource.
      const thirdLease = await run.ok(sharedResourceByKey.acquire("a"));

      expect(resources.getCreateCount()).toBe(2);
      expect(resources.getDisposeCount()).toBe(1);
      expect(thirdLease.resource).toBe(secondLease.resource);
    });
  });

  describe("lookup", () => {
    test("derives logical key identity", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create, {
          lookup: (key: { readonly id: string }) => key.id,
        }),
      );

      const first = await run.ok(sharedResourceByKey.acquire({ id: "a" }));
      const second = await run.ok(sharedResourceByKey.acquire({ id: "a" }));
      await run.ok(sharedResourceByKey.acquire({ id: "b" }));

      expect(resources.getCreateCount()).toBe(2);
      expect(second.resource).toBe(first.resource);
    });
  });

  describe("acquireCurrent", () => {
    test("returns undefined for an absent key without creating or registering it", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );

      const lease = await run.ok(sharedResourceByKey.acquireCurrent("a"));

      expect(lease).toBeUndefined();
      expect(resources.getCreateCount()).toBe(0);
      expect(sharedResourceByKey.snapshot().resourcesByKey.size).toBe(0);
    });

    test("acquires the current resource for an existing key without creating another", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );

      const first = await run.ok(sharedResourceByKey.acquire("a"));
      const current = await run.ok(sharedResourceByKey.acquireCurrent("a"));

      expect(current?.resource).toBe(first.resource);
      expect(current?.created).toBe(false);
      expect(resources.getCreateCount()).toBe(1);
    });
  });

  describe("use", () => {
    test("creates the keyed resource and releases its lease after the Task settles", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      let leaseCountDuringUse: number | undefined;
      let createdDuringUse: boolean | undefined;

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );
      const disposed = resources.nextDisposed();

      const value = await run.ok(
        sharedResourceByKey.use("a", (_resource, created) => () => {
          leaseCountDuringUse = sharedResourceByKey
            .snapshot()
            .resourcesByKey.get("a")?.leaseCount;
          createdDuringUse = created;
          return ok("used" as const);
        }),
      );

      expect(value).toBe("used");
      expect(createdDuringUse).toBe(true);
      expect(leaseCountDuringUse).toBe(1);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount,
      ).toBe(0);
      await disposed;
      expect(resources.getDisposeCount()).toBe(1);
    });

    test("reports created false while reusing a held keyed resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      let createdDuringUse: boolean | undefined;

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );
      using _lease = await run.ok(sharedResourceByKey.acquire("a"));

      await run.ok(
        sharedResourceByKey.use("a", (_resource, created) => () => {
          createdDuringUse = created;
          return ok();
        }),
      );

      expect(createdDuringUse).toBe(false);
      expect(resources.getCreateCount()).toBe(1);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount,
      ).toBe(1);
    });

    test("releases its keyed lease when the callback Task aborts", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const callbackStarted = Promise.withResolvers<void>();
      const gate = createGate();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );
      const disposed = resources.nextDisposed();

      const fiber = run.abortable(
        sharedResourceByKey.use("a", () => async (run) => {
          callbackStarted.resolve();
          await run.ok(gate.wait);
          return ok();
        }),
      );
      await callbackStarted.promise;

      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount,
      ).toBe(1);

      fiber.abort(testAbortReason);
      const result = await fiber;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(testAbortReason);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount ?? 0,
      ).toBe(0);

      await disposed;
      expect(resources.getDisposeCount()).toBe(1);
    });
  });

  describe("forEachCurrent", () => {
    test("delegates to every current resource while holding temporary leases", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey((_key: string) => resources.create),
      );

      const first = await run.ok(sharedResourceByKey.acquire("a"));
      const second = await run.ok(sharedResourceByKey.acquire("b"));
      const entries: Array<readonly [typeof first.resource, string]> = [];
      const leaseCountsDuringUse = new Map<string, number>();

      await run.ok(
        sharedResourceByKey.forEachCurrent((resource, key) => {
          entries.push([resource, key]);
          leaseCountsDuringUse.set(
            key,
            sharedResourceByKey.snapshot().resourcesByKey.get(key)!.leaseCount,
          );
        }),
      );

      expect(entries).toEqual([
        [first.resource, "a"],
        [second.resource, "b"],
      ]);
      expect(leaseCountsDuringUse).toEqual(
        new Map([
          ["a", 2],
          ["b", 2],
        ]),
      );
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount,
      ).toBe(1);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("b")?.leaseCount,
      ).toBe(1);
    });

    test("releases collected leases when the caller aborts while acquiring a later key", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const bCreateStarted = Promise.withResolvers<void>();
      const continueBCreate = Promise.withResolvers<void>();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey((key: string) => async (run) => {
          if (key === "b") {
            bCreateStarted.resolve();
            await continueBCreate.promise;
          }
          return run(resources.create);
        }),
      );

      using _a = await run.ok(sharedResourceByKey.acquire("a"));
      const b = run.ok(sharedResourceByKey.acquire("b"));
      await bCreateStarted.promise;

      const keys: Array<string> = [];
      const forEach = run.abortable(
        sharedResourceByKey.forEachCurrent((_resource, key) => {
          keys.push(key);
        }),
      );
      const firstAcquireRunSnapshot = forEach.run.snapshot().children[0];
      assert(firstAcquireRunSnapshot);
      // forEachCurrent acquires keys sequentially. Replacing this child means
      // the first lease is held and acquisition of the blocked second key has
      // started. The exact count intentionally pins that settlement pipeline.
      await expectConditionAfterMicrotasks(() => {
        const { children } = forEach.run.snapshot();
        return (
          children.length === 1 &&
          !Object.is(children[0].id, firstAcquireRunSnapshot.id)
        );
      }, 34);

      forEach.abort(testAbortReason);
      continueBCreate.resolve();
      using _b = await b;

      const result = await forEach;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(testAbortReason);
      expect(keys).toEqual([]);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.leaseCount,
      ).toBe(1);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("b")?.leaseCount,
      ).toBe(1);
    });

    test("skips a resource disposed before its temporary lease is acquired", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();
      const keys: Array<string> = [];

      const create: Task<AsyncDisposable> = () =>
        ok({
          [Symbol.asyncDispose]: async () => {
            disposalStarted.resolve();
            await continueDisposal.promise;
          },
        });

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey((_key: string) => create),
      );

      const first = await run.ok(sharedResourceByKey.acquire("a"));
      await run.ok(sharedResourceByKey.acquire("b"));

      first.release();
      await disposalStarted.promise;

      const forEach = run.ok(
        sharedResourceByKey.forEachCurrent((_resource, key) => {
          keys.push(key);
        }),
      );
      continueDisposal.resolve();
      await forEach;

      expect(keys).toEqual(["b"]);
    });
  });

  describe("idleDisposeAfter", () => {
    test("keeps a resource across release/acquire churn", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create, {
          idleDisposeAfter: "3s",
        }),
      );

      const first = await run.ok(sharedResourceByKey.acquire("a"));
      first.release();

      const second = await run.ok(sharedResourceByKey.acquire("a"));

      expect(resources.getCreateCount()).toBe(1);
      expect(second.resource).toBe(first.resource);

      // After the last release, the idle delay elapses and the key is disposed.
      const disposed = resources.nextDisposed();
      second.release();
      run.deps.time.advance("3s");
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
      expect(
        sharedResourceByKey.snapshot().resourcesByKey.get("a")?.hasResource,
      ).toBe(false);
    });
  });

  describe("snapshot", () => {
    test("returns current states by key", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );

      expect(sharedResourceByKey.snapshot()).toEqual({
        resourcesByKey: new Map(),
      });

      await run.ok(sharedResourceByKey.acquire("a"));
      await run.ok(sharedResourceByKey.acquire("a"));
      await run.ok(sharedResourceByKey.acquire("b"));

      expect(sharedResourceByKey.snapshot()).toEqual({
        resourcesByKey: new Map([
          [
            "a",
            {
              isIdle: false,
              leaseCount: 2,
              hasResource: true,
              idleDisposePending: false,
              mutex: idleMutexSnapshot,
            },
          ],
          [
            "b",
            {
              isIdle: false,
              leaseCount: 1,
              hasResource: true,
              idleDisposePending: false,
              mutex: idleMutexSnapshot,
            },
          ],
        ]),
      });
    });
  });

  describe("onDisposed", () => {
    test("does not call onDisposed when registry is disposed before resource creation", async () => {
      await using run = testCreateRun();
      const disposedKeys: Array<string> = [];

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(
          (_key: string) => createTestResources().create,
          {
            onDisposed: (key) => {
              disposedKeys.push(key);
            },
          },
        ),
      );

      await sharedResourceByKey[Symbol.asyncDispose]();

      expect(disposedKeys).toEqual([]);
    });

    test("calls onDisposed for every key during owner disposal", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const disposedKeys: Array<string> = [];

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey((_key: string) => resources.create, {
          onDisposed: (key) => {
            disposedKeys.push(key);
          },
        }),
      );
      await run.ok(sharedResourceByKey.acquire("a"));
      await run.ok(sharedResourceByKey.acquire("b"));

      await sharedResourceByKey[Symbol.asyncDispose]();

      expect(disposedKeys).toHaveLength(2);
      expect(disposedKeys).toEqual(expect.arrayContaining(["a", "b"]));
    });

    test("receives the key", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const disposedKeys: Array<string> = [];
      const onDisposedCalled = Promise.withResolvers<void>();

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey((_key: string) => resources.create, {
          onDisposed: (key) => {
            disposedKeys.push(key);
            onDisposedCalled.resolve();
          },
        }),
      );

      const lease = await run.ok(sharedResourceByKey.acquire("a"));

      expect(disposedKeys).toEqual([]);

      lease.release();
      await onDisposedCalled.promise;

      expect(disposedKeys).toEqual(["a"]);
    });
  });

  describe("disposal", () => {
    test("aborts acquire when the registry is disposed during creation", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const createStarted = Promise.withResolvers<void>();
      const continueCreate = Promise.withResolvers<void>();

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => async (run) => {
          const resource = await run.ok(resources.create);
          createStarted.resolve();
          await continueCreate.promise;
          return ok(resource);
        }),
      );

      const acquire = run.abortable(sharedResourceByKey.acquire("a"));
      await createStarted.promise;

      const disposal = sharedResourceByKey[Symbol.asyncDispose]();
      continueCreate.resolve();

      const result = await acquire;
      await disposal;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(runDisposedAbortReason);
      expect(resources.getCreateCount()).toBe(1);
      expect(resources.getDisposeCount()).toBe(1);
    });

    test("aborts acquireCurrent when the registry is disposed while it waits", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(
          () => () =>
            ok({
              [Symbol.asyncDispose]: async () => {
                disposalStarted.resolve();
                await continueDisposal.promise;
              },
            }),
        ),
      );

      const lease = await run.ok(sharedResourceByKey.acquire("a"));
      lease.release();
      await disposalStarted.promise;

      const acquireCurrent = run.abortable(
        sharedResourceByKey.acquireCurrent("a"),
      );
      await expectConditionAfterMicrotasks(
        () =>
          sharedResourceByKey.snapshot().resourcesByKey.get("a")?.mutex.waiters
            .length === 1,
        5,
      );

      const disposal = sharedResourceByKey[Symbol.asyncDispose]();
      continueDisposal.resolve();

      const result = await acquireCurrent;
      await disposal;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(runDisposedAbortReason);
    });

    test("disposes all keyed resources", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create),
      );

      const leaseA = await run.ok(sharedResourceByKey.acquire("a"));
      const leaseB = await run.ok(sharedResourceByKey.acquire("b"));

      await sharedResourceByKey[Symbol.asyncDispose]();

      expect(resources.getDisposeCount()).toBe(2);
      expect(leaseA.release()).toBe(false);
      expect(leaseB.release()).toBe(false);
      expect(sharedResourceByKey.snapshot().resourcesByKey.size).toBe(0);
    });

    test("registry disposal owns concurrently removed keys", async () => {
      await using run = testCreateRun();
      const aDisposalStarted = Promise.withResolvers<void>();
      const continueADisposal = Promise.withResolvers<void>();
      const aDisposed = Promise.withResolvers<void>();
      const bCreateStarted = Promise.withResolvers<void>();
      const bCreateGate = createGate();

      const create =
        (key: string): Task<AsyncDisposable> =>
        async (run) => {
          if (key === "b") {
            bCreateStarted.resolve();
            await run.ok(bCreateGate.wait);
          }

          return ok({
            [Symbol.asyncDispose]: async () => {
              if (key !== "a") return;
              aDisposalStarted.resolve();
              await continueADisposal.promise;
            },
          });
        };

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(create, {
          onDisposed: (key) => {
            if (key === "a") aDisposed.resolve();
          },
        }),
      );

      const a = await run.ok(sharedResourceByKey.acquire("a"));
      a.release();
      await aDisposalStarted.promise;

      const b = run.abortable(sharedResourceByKey.acquire("b"));
      await bCreateStarted.promise;

      const registryDisposal = sharedResourceByKey[Symbol.asyncDispose]();
      continueADisposal.resolve();
      await aDisposed.promise;

      bCreateGate.open();
      const bResult = await b;
      await registryDisposal;

      assert(!bResult.ok);
      assert(AbortError.is(bResult.error));
      expect(bResult.error.reason).toBe(runDisposedAbortReason);
      expect(run.snapshot().children).toEqual([]);
    });

    test("root Run disposal awaits keyed resource disposal", async () => {
      const run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(
          (_key: string) => () =>
            ok({
              [Symbol.asyncDispose]: async () => {
                disposalStarted.resolve();
                await continueDisposal.promise;
              },
            }),
        ),
      );
      await run.ok(sharedResourceByKey.acquire("a"));

      let rootDisposalSettled = false;
      const rootDisposal = run[Symbol.asyncDispose]().then(() => {
        rootDisposalSettled = true;
      });

      try {
        const firstSettled = await Promise.race([
          disposalStarted.promise.then(() => "resourceDisposalStarted"),
          rootDisposal.then(() => "rootDisposalSettled"),
        ]);

        expect(firstSettled).toBe("resourceDisposalStarted");
        expect(rootDisposalSettled).toBe(false);

        continueDisposal.resolve();
        await rootDisposal;

        expect(sharedResourceByKey.snapshot().resourcesByKey.size).toBe(0);
        expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([]);
      } finally {
        continueDisposal.resolve();
        await sharedResourceByKey[Symbol.asyncDispose]();
        await rootDisposal;
      }
    });
  });

  describe("leak detection", () => {
    test("warns when an undisposed SharedResourceByKey is garbage-collected", async () => {
      await using run = testCreateRun();

      await run.ok(
        createSharedResourceByKey(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );

      expect(run.deps.leakDetector.collect()).toBe(1);

      const entries = run.deps.console.getEntriesSnapshot();
      expect(entries).toHaveLength(1);
      expect(entries[0].method).toBe("warn");
      expect(entries[0].args[0]).toBe(
        "SharedResourceByKey was garbage-collected without cleanup. Tracked at:",
      );
    });
  });

  describe("defects", () => {
    test("acquire after registry disposal is a programmer error", async () => {
      await using run = testCreateRun();

      const sharedResourceByKey = await run.ok(
        createSharedResourceByKey(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      await sharedResourceByKey[Symbol.asyncDispose]();

      const result = await run.abortable(sharedResourceByKey.acquire("a"));

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBeInstanceOf(Error);
      expect((result.error.reason.defect as Error).message).toBe(
        "Cannot use a disposed object.",
      );
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing create factory panics the Run tree", async () => {
      await using run = testCreateRun();
      const defect = new Error("create failed");

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey((_key: string) => {
          throw defect;
        }),
      );

      const result = await run.abortable(sharedResourceByKey.acquire("a"));

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing lookup panics the Run tree", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const defect = new Error("lookup failed");

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create, {
          lookup: (_key: string): string => {
            throw defect;
          },
        }),
      );

      const result = await run.abortable(sharedResourceByKey.acquire("a"));

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing onDisposed panics the Run tree", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const defect = new Error("onDisposed failed");

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(() => resources.create, {
          onDisposed: () => {
            throw defect;
          },
        }),
      );

      const lease = await run.ok(sharedResourceByKey.acquire("a"));
      lease.release();

      // Disposal runs on a fire-and-forget Fiber, so the defect is observable
      // only via panic reporting.
      const abortError = await run.deps.reportDefect.next();
      assert(AbortError.is(abortError));
      assert(abortError.reason.type === "PanicAbortReason");
      expect(abortError.reason.defect).toBe(defect);
      expect(sharedResourceByKey.snapshot().resourcesByKey.has("a")).toBe(
        false,
      );
    });
  });

  describe("types", () => {
    test("acquire does not require captured deps", () => {
      interface TestDb extends Disposable {
        readonly query: () => string;
      }
      interface TestDep {
        readonly value: string;
      }

      expectTypeOf<
        SharedResourceByKey<string, TestDb>["acquire"]
      >().toEqualTypeOf<(key: string) => Task<Lease<TestDb>>>();

      const create = ((_key: string) => () =>
        ok({ [Symbol.dispose]: lazyVoid })) as (
        key: string,
      ) => Task<Disposable, never, TestDep>;

      expectTypeOf(createSharedResourceByKey(create)).toEqualTypeOf<
        Task<SharedResourceByKey<string, Disposable>, never, TestDep>
      >();
      expectTypeOf(
        createSharedResourceByKey(create, { lookup: (key) => key }),
      ).toEqualTypeOf<
        Task<SharedResourceByKey<string, Disposable>, never, TestDep>
      >();

      const failingCreate = (_key: string) => () =>
        err({ type: "CreateError" });

      // @ts-expect-error - create Task must not fail.
      createSharedResourceByKey(failingCreate);
    });

    test("keyed acquireCurrent and use preserve their Task types", async () => {
      await using run = testCreateRun();

      interface TestDb extends Disposable {
        readonly query: () => string;
      }
      interface TestError {
        readonly type: "TestError";
      }
      interface TestDep {
        readonly value: string;
      }

      const create =
        (_key: string): Task<TestDb> =>
        () =>
          ok({ query: () => "result", [Symbol.dispose]: lazyVoid });

      await using sharedResourceByKey = await run.ok(
        createSharedResourceByKey(create),
      );

      expectTypeOf(sharedResourceByKey.acquireCurrent).toEqualTypeOf<
        (key: string) => Task<Lease<TestDb> | undefined>
      >();

      const use = sharedResourceByKey.use(
        "a",
        (): Task<"used", TestError, TestDep> => () =>
          err({ type: "TestError" }),
      );
      expectTypeOf(use).toEqualTypeOf<Task<"used", TestError, TestDep>>();
    });
  });
});

describe("SharedResourceByKeyWithClaims", () => {
  describe("types", () => {
    test("types expose claim as a non-failing Task returning ClaimLease", () => {
      expectTypeOf<ClaimLease>().toExtend<Disposable>();
      expectTypeOf<
        SharedResourceByKeyWithClaims<string, number, Disposable>["claim"]
      >().toEqualTypeOf<
        (
          claim: number,
          resourceKeys: NonEmptyReadonlyArray<string>,
        ) => Task<ClaimLease>
      >();

      createSharedResourceByKeyWithClaims(
        (_key: string): Task<Disposable> =>
          () =>
            ok({ [Symbol.dispose]: lazyVoid }),
      );
    });

    test("types expose scoped use with borrowed resources and callback Task errors and dependencies", () => {
      expectTypeOf<
        SharedResourceByKeyWithClaims<string, number, Disposable>["use"]
      >().toEqualTypeOf<
        <R, E, D>(
          claim: number,
          resourceKeys: NonEmptyReadonlyArray<string>,
          callback: (
            resources: NonEmptyReadonlyArray<
              readonly [BorrowedResource<Disposable>, string]
            >,
          ) => Task<R, E, D>,
        ) => Task<R, E, D>
      >();
    });

    test("types reject empty claim and use resource keys", () => {
      type Claims = SharedResourceByKeyWithClaims<string, number, Disposable>;

      // @ts-expect-error - a claim must retain at least one resource.
      const _invalidClaimResourceKeys: Parameters<Claims["claim"]>[1] = [];
      // @ts-expect-error - scoped use must retain at least one resource.
      const _invalidUseResourceKeys: Parameters<Claims["use"]>[1] = [];
    });

    test("types do not expose command-based removeClaim", () => {
      expectTypeOf<
        SharedResourceByKeyWithClaims<string, number, Disposable>
      >().not.toHaveProperty("removeClaim");
    });

    test("types accept interface-shaped keys and claims with lookup functions", () => {
      interface ResourceKey {
        readonly id: string;
      }

      interface Claim {
        readonly id: number;
      }

      const task = createSharedResourceByKeyWithClaims(
        (_key: ResourceKey): Task<Disposable> =>
          () =>
            ok({ [Symbol.dispose]: lazyVoid }),
        {
          resourceLookup: (key) => key.id,
          claimLookup: (claim: Claim) => claim.id,
        },
      );

      expectTypeOf(task).toEqualTypeOf<
        Task<SharedResourceByKeyWithClaims<ResourceKey, Claim, Disposable>>
      >();
    });
  });

  describe("use", () => {
    test("provides only its resources in input order and releases them after the callback settles", async () => {
      await using run = testCreateRun();
      const callbackStarted = Promise.withResolvers<void>();
      const continueCallback = createGate();
      const scopedResourcesDisposed = Promise.withResolvers<void>();
      const disposedKeys = new Set<string>();

      interface TestResource extends Disposable {
        readonly key: string;
        readonly isDisposed: () => boolean;
      }

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<TestResource> =>
            () =>
              ok({
                key,
                isDisposed: () => disposedKeys.has(key),
                [Symbol.dispose]: () => {
                  disposedKeys.add(key);
                  if (disposedKeys.has("a") && disposedKeys.has("b")) {
                    scopedResourcesDisposed.resolve();
                  }
                },
              }),
        ),
      );
      using _existingClaimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["existing"]),
      );

      const use = run.ok(
        sharedResourceByKeyWithClaims.use(
          "claim",
          ["b", "a"],
          (resources) => async (run) => {
            callbackStarted.resolve();
            await run.ok(continueCallback.wait);
            return ok(
              resources.map(([resource, resourceKey]) => {
                expect(resource.isDisposed()).toBe(false);
                return [resource.key, resourceKey] as const;
              }),
            );
          },
        ),
      );
      await callbackStarted.promise;

      expect(disposedKeys).toEqual(new Set());
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["existing", "b", "a"]));

      continueCallback.open();

      expect(await use).toEqual([
        ["b", "b"],
        ["a", "a"],
      ]);
      await scopedResourcesDisposed.promise;
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["existing"]));
    });

    test("releases its ClaimLease when the callback Task aborts", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const callbackStarted = Promise.withResolvers<void>();
      const gate = createGate();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => resources.create),
      );
      const disposed = resources.nextDisposed();

      const fiber = run.abortable(
        sharedResourceByKeyWithClaims.use(
          "claim",
          ["resource"],
          () => async (run) => {
            callbackStarted.resolve();
            await run.ok(gate.wait);
            return ok();
          },
        ),
      );
      await callbackStarted.promise;

      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["resource"]));

      fiber.abort(testAbortReason);
      const result = await fiber;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(testAbortReason);
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());

      await disposed;
      expect(resources.getDisposeCount()).toBe(1);
    });
  });

  describe("claim lifecycle", () => {
    test("claim lazily creates and retains every keyed resource until its claim lease is released", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => resources.create),
      );

      expect(resources.getCreateCount()).toBe(0);

      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      expect(resources.getCreateCount()).toBe(1);
      expect(resources.getDisposeCount()).toBe(0);

      const disposed = resources.nextDisposed();
      expect(claimLease.release()).toBe(true);
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("claim lease release is idempotent", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => resources.create),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      const disposed = resources.nextDisposed();
      expect(claimLease.release()).toBe(true);
      expect(claimLease.release()).toBe(false);
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("claim lease Symbol.dispose releases it", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => resources.create),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      const disposed = resources.nextDisposed();
      claimLease[Symbol.dispose]();
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("repeated claims for the same logical pair retain independently without duplicating the relation", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: { readonly id: string }) => resources.create,
          {
            resourceLookup: (key) => key.id,
            claimLookup: (claim: { readonly id: string }) => claim.id,
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim({ id: "claim" }, [
          { id: "resource" },
        ]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim({ id: "claim" }, [
          { id: "resource" },
        ]),
      );

      expect(resources.getCreateCount()).toBe(1);

      const disposed = resources.nextDisposed();
      expect(first.release()).toBe(true);
      expect(resources.getDisposeCount()).toBe(0);
      expect(second.release()).toBe(true);
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("multiple claims share one keyed resource until the last claim lease is released", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => resources.create),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );

      expect(resources.getCreateCount()).toBe(1);

      const disposed = resources.nextDisposed();
      expect(first.release()).toBe(true);
      expect(resources.getDisposeCount()).toBe(0);
      expect(second.release()).toBe(true);
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("one claim lease retains and releases multiple resource keys together", async () => {
      await using run = testCreateRun();
      const createdKeys: Array<string> = [];
      const disposedKeys: Array<string> = [];
      const allDisposed = Promise.withResolvers<void>();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<Disposable> =>
            () => {
              createdKeys.push(key);
              return ok({
                [Symbol.dispose]: () => {
                  disposedKeys.push(key);
                  if (disposedKeys.length === 2) allDisposed.resolve();
                },
              });
            },
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );

      expect(createdKeys).toEqual(["a", "b"]);

      expect(claimLease.release()).toBe(true);
      await allDisposed.promise;

      expect(new Set(disposedKeys)).toEqual(new Set(["a", "b"]));
    });

    test("claim rejects lookup-duplicate resource keys as a programmer defect", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: { readonly id: string }) => resources.create,
          { resourceLookup: (key) => key.id },
        ),
      );

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", [
          { id: "resource" },
          { id: "resource" },
        ]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBeInstanceOf(Error);
      expect((result.error.reason.defect as Error).message).toBe(
        "resourceKeys must not contain lookup duplicates.",
      );
      expect(resources.getCreateCount()).toBe(0);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("claim snapshots resource keys before awaiting acquisition", async () => {
      await using run = testCreateRun();
      const createStarted = Promise.withResolvers<void>();
      const continueCreate = Promise.withResolvers<void>();
      const createdKeys: Array<string> = [];
      const resourceKeys: NonEmptyArray<string> = ["a"];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<Disposable> =>
            async () => {
              createdKeys.push(key);
              if (key === "a") {
                createStarted.resolve();
                await continueCreate.promise;
              }
              return ok({ [Symbol.dispose]: lazyVoid });
            },
        ),
      );

      const claim = run.ok(
        sharedResourceByKeyWithClaims.claim("claim", resourceKeys),
      );
      await createStarted.promise;
      resourceKeys.push("b");
      continueCreate.resolve();
      using _claimLease = await claim;

      expect(createdKeys).toEqual(["a"]);
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["a"]));
    });

    test("later claim deps do not replace deps captured for resource creation", async () => {
      await using run = testCreateRun();

      interface TestDep {
        readonly value: string;
      }

      const createValues: Array<string> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string): Task<Disposable, never, TestDep> =>
            ({ deps }) => {
              createValues.push(deps.value);
              return ok({ [Symbol.dispose]: lazyVoid });
            },
        ),
        { value: "captured" },
      );

      using _claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
        { value: "replacement" },
      );

      expect(createValues).toEqual(["captured"]);
    });
  });

  describe("relations", () => {
    test("gets unique canonical claims retaining a resource key", async () => {
      await using run = testCreateRun();

      interface ResourceKey {
        readonly id: string;
        readonly label: string;
      }

      interface Claim {
        readonly id: string;
        readonly label: string;
      }

      const resourceKey = { id: "resource", label: "first" };
      const firstClaim = { id: "first", label: "first" };
      const equivalentFirstClaim = { id: "first", label: "equivalent" };
      const secondClaim = { id: "second", label: "second" };

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: ResourceKey) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            resourceLookup: (key) => key.id,
            claimLookup: (claim: Claim) => claim.id,
          },
        ),
      );
      using _first = await run.ok(
        sharedResourceByKeyWithClaims.claim(firstClaim, [resourceKey]),
      );
      using _equivalentFirst = await run.ok(
        sharedResourceByKeyWithClaims.claim(equivalentFirstClaim, [
          { id: "resource", label: "equivalent" },
        ]),
      );
      using _second = await run.ok(
        sharedResourceByKeyWithClaims.claim(secondClaim, [resourceKey]),
      );

      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource({
          id: "resource",
          label: "query",
        }),
      ).toEqual(new Set([firstClaim, secondClaim]));

      const snapshot = sharedResourceByKeyWithClaims.snapshot();
      expect([...snapshot.retainCountsByResourceKeyByClaim.keys()][0]).toBe(
        firstClaim,
      );
      const firstClaimRetainCounts =
        snapshot.retainCountsByResourceKeyByClaim.get(firstClaim);
      assert(firstClaimRetainCounts);
      expect([...firstClaimRetainCounts.keys()][0]).toBe(resourceKey);
      expect([...snapshot.resourcesByKey.keys()][0]).toBe(resourceKey);
    });

    test("gets unique canonical resource keys retained by a claim", async () => {
      await using run = testCreateRun();

      interface ResourceKey {
        readonly id: string;
        readonly label: string;
      }

      interface Claim {
        readonly id: string;
        readonly label: string;
      }

      const claim = { id: "claim", label: "first" };
      const firstResourceKey = { id: "first", label: "first" };
      const secondResourceKey = { id: "second", label: "second" };

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: ResourceKey) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            resourceLookup: (key) => key.id,
            claimLookup: (claim: Claim) => claim.id,
          },
        ),
      );
      using _first = await run.ok(
        sharedResourceByKeyWithClaims.claim(claim, [firstResourceKey]),
      );
      using _second = await run.ok(
        sharedResourceByKeyWithClaims.claim(
          { id: "claim", label: "equivalent" },
          [{ id: "first", label: "equivalent" }, secondResourceKey],
        ),
      );

      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim({
          id: "claim",
          label: "query",
        }),
      ).toEqual(new Set([firstResourceKey, secondResourceKey]));
    });

    test("keeps canonical representatives until their logical relations end", async () => {
      await using run = testCreateRun();

      interface ResourceKey {
        readonly id: string;
        readonly label: string;
      }

      interface Claim {
        readonly id: string;
        readonly label: string;
      }

      const firstClaim = { id: "claim", label: "first" };
      const equivalentClaim = { id: "claim", label: "equivalent" };
      const firstResourceKey = { id: "resource", label: "first" };
      const equivalentResourceKey = {
        id: "resource",
        label: "equivalent",
      };
      const lastClaimRemoved: Array<readonly [Claim, ResourceKey]> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: ResourceKey) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            resourceLookup: (key) => key.id,
            claimLookup: (claim: Claim) => claim.id,
            onLastClaimRemoved: (claim, _resource, resourceKey) => {
              lastClaimRemoved.push([claim, resourceKey]);
            },
          },
        ),
      );
      const firstClaimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim(firstClaim, [firstResourceKey]),
      );
      const equivalentClaimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim(equivalentClaim, [
          equivalentResourceKey,
        ]),
      );

      firstClaimLease.release();

      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource(
          equivalentResourceKey,
        ),
      ).toEqual(new Set([firstClaim]));
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim(equivalentClaim),
      ).toEqual(new Set([firstResourceKey]));

      const snapshot = sharedResourceByKeyWithClaims.snapshot();
      expect([...snapshot.retainCountsByResourceKeyByClaim.keys()]).toEqual([
        firstClaim,
      ]);
      expect([
        ...snapshot.retainCountsByResourceKeyByClaim.get(firstClaim)!.keys(),
      ]).toEqual([firstResourceKey]);
      expect([...snapshot.resourcesByKey.keys()]).toEqual([firstResourceKey]);

      equivalentClaimLease.release();

      expect(lastClaimRemoved).toEqual([[firstClaim, firstResourceKey]]);
    });

    test("iterates current resources for a claim while pair leases keep them alive", async () => {
      await using run = testCreateRun();

      interface TestResource extends Disposable {
        readonly id: string;
        readonly isDisposed: () => boolean;
      }

      const disposedIds = new Set<string>();
      const visited: Array<readonly [string, string]> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: { readonly id: string }): Task<TestResource> =>
            () =>
              ok({
                id: key.id,
                isDisposed: () => disposedIds.has(key.id),
                [Symbol.dispose]: () => {
                  disposedIds.add(key.id);
                },
              }),
          {
            resourceLookup: (key) => key.id,
            claimLookup: (claim: { readonly id: string }) => claim.id,
          },
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim({ id: "claim" }, [
          { id: "a" },
          { id: "b" },
        ]),
      );

      sharedResourceByKeyWithClaims.forEachResourceForClaim(
        { id: "claim" },
        (resource, resourceKey) => {
          expect(resource.isDisposed()).toBe(false);
          visited.push([resource.id, resourceKey.id]);
        },
      );

      expect(visited).toEqual([
        ["a", "a"],
        ["b", "b"],
      ]);
      expect(disposedIds.size).toBe(0);

      claimLease.release();
    });

    test("relation queries are empty after the final claim lease is released", async () => {
      await using run = testCreateRun();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set(["claim"]));
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["resource"]));

      claimLease.release();

      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set());
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());

      const visited: Array<string> = [];
      sharedResourceByKeyWithClaims.forEachResourceForClaim("claim", () => {
        visited.push("visited");
      });
      expect(visited).toEqual([]);
    });

    test("iteration is stable when a callback releases the claim lease", async () => {
      await using run = testCreateRun();
      const disposedKeys = new Set<string>();
      const allDisposed = Promise.withResolvers<void>();

      interface TestResource extends Disposable {
        readonly isDisposed: () => boolean;
      }

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<TestResource> =>
            () =>
              ok({
                isDisposed: () => disposedKeys.has(key),
                [Symbol.dispose]: () => {
                  disposedKeys.add(key);
                  if (disposedKeys.size === 2) allDisposed.resolve();
                },
              }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );
      const visited: Array<string> = [];

      sharedResourceByKeyWithClaims.forEachResourceForClaim(
        "claim",
        (resource, resourceKey) => {
          expect(resource.isDisposed()).toBe(false);
          visited.push(resourceKey);
          if (resourceKey === "a") expect(claimLease.release()).toBe(true);
        },
      );

      expect(visited).toEqual(["a", "b"]);
      expect(disposedKeys.size).toBe(0);
      await allDisposed.promise;
      expect(disposedKeys).toEqual(new Set(["a", "b"]));
      expect(claimLease.release()).toBe(false);
    });
  });

  describe("transitions", () => {
    test("calls onFirstClaimAdded for each claim-resource pair's first retain", async () => {
      await using run = testCreateRun();
      const calls: Array<readonly [string, string, string]> = [];

      interface TestResource extends Disposable {
        readonly id: string;
      }

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<TestResource> =>
            () =>
              ok({ id: key, [Symbol.dispose]: lazyVoid }),
          {
            onFirstClaimAdded: (claim: string, resource, resourceKey) => {
              calls.push([claim, resource.id, resourceKey]);
            },
          },
        ),
      );

      using _first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      using _second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );

      expect(calls).toEqual([
        ["first", "resource", "resource"],
        ["second", "resource", "resource"],
      ]);
    });

    test("onFirstClaimAdded can iterate all resources retained by the claim", async () => {
      await using run = testCreateRun();
      const visitedKeys: Array<string> = [];
      let forEachResourceForClaim = (
        _claim: string,
        _callback: (
          resource: BorrowedResource<Disposable>,
          resourceKey: string,
        ) => void,
      ): void => {
        throw new Error("forEachResourceForClaim is not initialized.");
      };

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            onFirstClaimAdded: (claim: string, _resource, resourceKey) => {
              if (resourceKey !== "a") return;
              forEachResourceForClaim(claim, (_resource, resourceKey) => {
                visitedKeys.push(resourceKey);
              });
            },
          },
        ),
      );
      forEachResourceForClaim = (claim, callback) => {
        sharedResourceByKeyWithClaims.forEachResourceForClaim(claim, callback);
      };

      using _claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );

      expect(visitedKeys).toEqual(["a", "b"]);
    });

    test("calls onLastClaimRemoved before a key loses its final lease", async () => {
      await using run = testCreateRun();
      let resourceDisposed = false;
      let callbackState:
        | {
            readonly claim: string;
            readonly key: string;
            readonly disposed: boolean;
          }
        | undefined;

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () =>
            ok({
              isDisposed: () => resourceDisposed,
              [Symbol.dispose]: () => {
                resourceDisposed = true;
              },
            }),
          {
            onLastClaimRemoved: (claim: string, resource, resourceKey) => {
              callbackState = {
                claim,
                key: resourceKey,
                disposed: resource.isDisposed(),
              };
            },
          },
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      claimLease.release();

      expect(callbackState).toEqual({
        claim: "claim",
        key: "resource",
        disposed: false,
      });
    });

    test("onLastClaimRemoved observes the current pair removed and later lease keys retained", async () => {
      await using run = testCreateRun();
      const relationStates: Array<
        readonly [string, ReadonlySet<string>, ReadonlySet<string>]
      > = [];
      let getClaimsForResource = (_resourceKey: string): ReadonlySet<string> =>
        new Set();
      let getResourceKeysForClaim = (_claim: string): ReadonlySet<string> =>
        new Set();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            onLastClaimRemoved: (claim: string, _resource, resourceKey) => {
              if (claim !== "claim") return;
              relationStates.push([
                resourceKey,
                getClaimsForResource(resourceKey),
                getResourceKeysForClaim(claim),
              ]);
            },
          },
        ),
      );
      getClaimsForResource = (resourceKey) =>
        sharedResourceByKeyWithClaims.getClaimsForResource(resourceKey);
      getResourceKeysForClaim = (claim) =>
        sharedResourceByKeyWithClaims.getResourceKeysForClaim(claim);

      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );
      using _otherClaimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("other", ["a"]),
      );

      claimLease.release();

      expect(relationStates).toEqual([
        ["a", new Set(["other"]), new Set(["b"])],
        ["b", new Set(), new Set()],
      ]);
    });

    test("calls onLastClaimRemoved for each claim-resource pair's final release", async () => {
      await using run = testCreateRun();
      const calls: Array<string> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            onLastClaimRemoved: (claim: string) => {
              calls.push(claim);
            },
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );

      first.release();
      expect(calls).toEqual(["first"]);

      second.release();
      expect(calls).toEqual(["first", "second"]);
    });

    test("pair transitions ignore intermediate retains and releases", async () => {
      await using run = testCreateRun();
      const firstCalls: Array<string> = [];
      const lastCalls: Array<string> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            onFirstClaimAdded: (claim: string) => {
              firstCalls.push(claim);
            },
            onLastClaimRemoved: (claim: string) => {
              lastCalls.push(claim);
            },
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      expect(firstCalls).toEqual(["claim"]);

      first.release();
      expect(lastCalls).toEqual([]);

      second.release();
      expect(lastCalls).toEqual(["claim"]);
    });

    test("calls onFirstClaimAdded again after zero claims is reached while the resource idles", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const resourcesAtFirstClaim: Array<object> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          {
            idleDisposeAfter: "3s",
            onFirstClaimAdded: (_claim, resource) => {
              resourcesAtFirstClaim.push(resource);
            },
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      first.release();

      using _second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );

      expect(resources.getCreateCount()).toBe(1);
      expect(resourcesAtFirstClaim).toHaveLength(2);
      expect(resourcesAtFirstClaim[1]).toBe(resourcesAtFirstClaim[0]);
    });

    test("registry disposal drains claims without calling transition callbacks because disposal is not semantic claim removal", async () => {
      await using run = testCreateRun();
      const lastClaimRemoved: Array<string> = [];

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            onLastClaimRemoved: (claim: string) => {
              lastClaimRemoved.push(claim);
            },
          },
        ),
      );
      await run.ok(sharedResourceByKeyWithClaims.claim("claim", ["resource"]));

      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      expect(lastClaimRemoved).toEqual([]);
    });

    test("onFirstClaimAdded defects compensate completed transitions in reverse order and clean up resources", async () => {
      await using run = testCreateRun();
      const defect = new Error("onFirstClaimAdded failed");
      const firstTransitions: Array<string> = [];
      const lastTransitions: Array<string> = [];
      const resourceKeysDuringTransitions: Array<ReadonlySet<string>> = [];
      const allDisposed = Promise.withResolvers<void>();
      let disposeCount = 0;
      let getResourceKeysForClaim = (): ReadonlySet<string> => new Set();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () =>
            ok({
              [Symbol.dispose]: () => {
                disposeCount++;
                if (disposeCount === 3) allDisposed.resolve();
              },
            }),
          {
            onFirstClaimAdded: (_claim, _resource, resourceKey) => {
              resourceKeysDuringTransitions.push(getResourceKeysForClaim());
              if (resourceKey === "c") throw defect;
              firstTransitions.push(resourceKey);
            },
            onLastClaimRemoved: (_claim, _resource, resourceKey) => {
              resourceKeysDuringTransitions.push(getResourceKeysForClaim());
              lastTransitions.push(resourceKey);
            },
          },
        ),
      );
      getResourceKeysForClaim = () =>
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim");

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b", "c"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      await allDisposed.promise;
      expect(firstTransitions).toEqual(["a", "b"]);
      expect(lastTransitions).toEqual(["b", "a"]);
      expect(resourceKeysDuringTransitions).toEqual([
        new Set(["a", "b", "c"]),
        new Set(["a", "b", "c"]),
        new Set(["a", "b", "c"]),
        new Set(["a", "b", "c"]),
        new Set(["a", "b", "c"]),
      ]);
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("compensation callback defects also panic while cleanup completes", async () => {
      await using run = testCreateRun();
      const firstDefect = new Error("onFirstClaimAdded failed");
      const compensationDefect = new Error("compensation failed");
      const allDisposed = Promise.withResolvers<void>();
      let disposeCount = 0;

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () =>
            ok({
              [Symbol.dispose]: () => {
                disposeCount++;
                if (disposeCount === 2) allDisposed.resolve();
              },
            }),
          {
            onFirstClaimAdded: (_claim, _resource, resourceKey) => {
              if (resourceKey === "b") throw firstDefect;
            },
            onLastClaimRemoved: () => {
              throw compensationDefect;
            },
          },
        ),
      );

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(firstDefect);
      await allDisposed.promise;
      expect(
        run.deps.reportDefect.getDefectsSnapshot().map((reported) => {
          assert(AbortError.is(reported));
          assert(reported.reason.type === "PanicAbortReason");
          return reported.reason.defect;
        }),
      ).toEqual([compensationDefect, firstDefect]);
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());
    });

    test("onLastClaimRemoved defects panic the owner Run and resources are cleaned up", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const defect = new Error("onLastClaimRemoved failed");

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          {
            onLastClaimRemoved: () => {
              throw defect;
            },
          },
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );
      const disposed = resources.nextDisposed();

      expect(claimLease.release()).toBe(true);

      const abortError = await run.deps.reportDefect.next();
      assert(AbortError.is(abortError));
      assert(abortError.reason.type === "PanicAbortReason");
      expect(abortError.reason.defect).toBe(defect);
      await disposed;
      expect(resources.getDisposeCount()).toBe(1);
      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set());
    });
  });

  describe("idle disposal", () => {
    test("the final claim release keeps the resource alive until idleDisposeAfter elapses", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          { idleDisposeAfter: "3s" },
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      expect(claimLease.release()).toBe(true);
      run.deps.time.advance("2s");

      expect(resources.getDisposeCount()).toBe(0);
      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set());

      const disposed = resources.nextDisposed();
      run.deps.time.advance("1s");
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });

    test("a claim acquired during idle delay reuses the current resource", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const resourcesAtFirstClaim: Array<object> = [];

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          {
            idleDisposeAfter: "3s",
            onFirstClaimAdded: (_claim, resource) => {
              resourcesAtFirstClaim.push(resource);
            },
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      first.release();
      run.deps.time.advance("2s");

      using _second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );

      expect(resources.getCreateCount()).toBe(1);
      expect(resourcesAtFirstClaim).toHaveLength(2);
      expect(resourcesAtFirstClaim[1]).toBe(resourcesAtFirstClaim[0]);

      run.deps.time.advance("1s");
      expect(resources.getDisposeCount()).toBe(0);
    });

    test("a claim acquired after disposal starts creates a fresh resource generation", async () => {
      await using run = testCreateRun();
      const firstDisposalStarted = Promise.withResolvers<void>();
      const continueFirstDisposal = Promise.withResolvers<void>();
      const resourcesAtFirstClaim: Array<{ readonly id: number }> = [];
      let createCount = 0;

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string): Task<AsyncDisposable & { readonly id: number }> =>
            () => {
              const id = ++createCount;
              return ok({
                id,
                [Symbol.asyncDispose]: async () => {
                  if (id !== 1) return;
                  firstDisposalStarted.resolve();
                  await continueFirstDisposal.promise;
                },
              });
            },
          {
            idleDisposeAfter: "3s",
            onFirstClaimAdded: (_claim, resource) => {
              resourcesAtFirstClaim.push(resource);
            },
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      first.release();
      run.deps.time.advance("3s");
      await firstDisposalStarted.promise;

      const second = run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );
      const createCountWhileDisposing = createCount;
      continueFirstDisposal.resolve();
      using _second = await second;

      expect(createCountWhileDisposing).toBe(1);
      expect(createCount).toBe(2);
      expect(resourcesAtFirstClaim.map((resource) => resource.id)).toEqual([
        1, 2,
      ]);
    });

    test("a stale disposal callback does not hide a reacquired resource", async () => {
      await using run = testCreateRun();
      const firstDisposalStarted = Promise.withResolvers<void>();
      const continueFirstDisposal = Promise.withResolvers<void>();
      let createCount = 0;

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string): Task<AsyncDisposable> =>
            () => {
              const id = ++createCount;
              return ok({
                [Symbol.asyncDispose]: async () => {
                  if (id !== 1) return;
                  firstDisposalStarted.resolve();
                  await continueFirstDisposal.promise;
                },
              });
            },
          { idleDisposeAfter: "3s" },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      first.release();
      run.deps.time.advance("3s");
      await firstDisposalStarted.promise;

      const second = run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );
      continueFirstDisposal.resolve();
      using _second = await second;
      using _third = await run.ok(
        sharedResourceByKeyWithClaims.claim("third", ["resource"]),
      );

      expect(createCount).toBe(2);
      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set(["second", "third"]));
    });

    test("reacquisition and release restart the idle disposal delay", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          { idleDisposeAfter: "3s" },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      first.release();
      run.deps.time.advance("2s");

      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );
      second.release();
      run.deps.time.advance("1s");

      expect(resources.getDisposeCount()).toBe(0);

      const disposed = resources.nextDisposed();
      run.deps.time.advance("2s");
      await disposed;

      expect(resources.getDisposeCount()).toBe(1);
    });
  });

  describe("concurrency and abort", () => {
    test("concurrent first claims for one key share one resource creation", async () => {
      await using run = testCreateRun();
      const createStarted = Promise.withResolvers<void>();
      const continueCreate = createGate();
      let createCount = 0;

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string): Task<Disposable> =>
            async (run) => {
              createCount++;
              createStarted.resolve();
              await run.ok(continueCreate.wait);
              return ok({ [Symbol.dispose]: lazyVoid });
            },
        ),
      );

      const first = run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["resource"]),
      );
      await createStarted.promise;
      const second = run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["resource"]),
      );
      continueCreate.open();

      using _first = await first;
      using _second = await second;

      expect(createCount).toBe(1);
      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set(["first", "second"]));
    });

    test("claim completes despite caller abort once acquisition starts", async () => {
      await using run = testCreateRun();
      const createStarted = Promise.withResolvers<void>();
      const continueCreate = createGate();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string): Task<Disposable> =>
            async (run) => {
              createStarted.resolve();
              await run.ok(continueCreate.wait);
              return ok({ [Symbol.dispose]: lazyVoid });
            },
        ),
      );
      const claim = run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );
      await createStarted.promise;

      claim.abort(testAbortReason);
      continueCreate.open();

      const result = await claim;

      assert(result.ok);
      using _claimLease = result.value;
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["resource"]));
    });

    test("overlapping claims acquired in different key orders complete without deadlock", async () => {
      await using run = testCreateRun();
      const bothCreatesStarted = createGate();
      const startedKeys = new Set<string>();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<Disposable> =>
            async (run) => {
              startedKeys.add(key);
              if (startedKeys.size === 2) bothCreatesStarted.open();
              await run.ok(bothCreatesStarted.wait);
              return ok({ [Symbol.dispose]: lazyVoid });
            },
        ),
      );

      const first = run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["a", "b"]),
      );
      const second = run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["b", "a"]),
      );

      using _first = await first;
      using _second = await second;

      expect(startedKeys).toEqual(new Set(["a", "b"]));
    });

    test("a claim waiting for one key does not block claims for disjoint keys", async () => {
      await using run = testCreateRun();
      const blockedCreateStarted = Promise.withResolvers<void>();
      const continueBlockedCreate = createGate();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<Disposable> =>
            async (run) => {
              if (key === "blocked") {
                blockedCreateStarted.resolve();
                await run.ok(continueBlockedCreate.wait);
              }
              return ok({ [Symbol.dispose]: lazyVoid });
            },
        ),
      );
      const blocked = run.ok(
        sharedResourceByKeyWithClaims.claim("blocked", ["blocked"]),
      );
      await blockedCreateStarted.promise;

      using _disjoint = await run.ok(
        sharedResourceByKeyWithClaims.claim("disjoint", ["disjoint"]),
      );

      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("disjoint"),
      ).toEqual(new Set(["disjoint"]));

      continueBlockedCreate.open();
      using _blocked = await blocked;
    });

    test("claim re-inserts a resource generation pinned before another claim removes its relation", async () => {
      await using run = testCreateRun();
      const trailingCreateStarted = Promise.withResolvers<void>();
      const continueTrailingCreate = createGate();
      const createCountsByKey = new Map<string, number>();

      interface TestResource extends Disposable {
        readonly key: string;
      }

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<TestResource> =>
            async (run) => {
              if (key === "trailing") {
                trailingCreateStarted.resolve();
                await run.ok(continueTrailingCreate.wait);
              }
              createCountsByKey.set(key, (createCountsByKey.get(key) ?? 0) + 1);
              return ok({ key, [Symbol.dispose]: lazyVoid });
            },
        ),
      );
      const firstClaimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["shared"]),
      );
      let firstResource: BorrowedResource<TestResource> | undefined;
      sharedResourceByKeyWithClaims.forEachResourceForClaim(
        "first",
        (resource) => {
          firstResource = resource;
        },
      );

      const secondClaim = run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["shared", "trailing"]),
      );
      await trailingCreateStarted.promise;

      firstClaimLease.release();
      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("shared"),
      ).toEqual(new Set());

      continueTrailingCreate.open();
      using _secondClaimLease = await secondClaim;

      let secondResource: BorrowedResource<TestResource> | undefined;
      sharedResourceByKeyWithClaims.forEachResourceForClaim(
        "second",
        (resource, resourceKey) => {
          if (resourceKey === "shared") secondResource = resource;
        },
      );
      expect(secondResource).toBe(firstResource);
      expect(createCountsByKey.get("shared")).toBe(1);
    });

    test("registry disposal before claim transfer aborts acquisition and releases partial leases", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const secondCreateStarted = Promise.withResolvers<void>();
      const secondCreateGate = createGate();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (key: string): Task<Disposable> =>
            async (run) => {
              if (key === "b") {
                secondCreateStarted.resolve();
                await run.ok(secondCreateGate.wait);
              }
              return run(resources.create);
            },
        ),
      );
      const claim = run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );
      await secondCreateStarted.promise;

      const disposal = sharedResourceByKeyWithClaims[Symbol.asyncDispose]();
      secondCreateGate.open();
      const result = await claim;
      await disposal;

      assert(!result.ok);
      assert(AbortError.is(result.error));
      expect(result.error.reason).toBe(runDisposedAbortReason);
      expect(resources.getCreateCount()).toBe(2);
      expect(resources.getDisposeCount()).toBe(2);
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());
    });

    test("registry disposal after claim transfer can drain the lease before the caller awaits it", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const claimTransferred = Promise.withResolvers<void>();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          { onFirstClaimAdded: () => claimTransferred.resolve() },
        ),
      );
      const claim = run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      await claimTransferred.promise;
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set(["resource"]));
      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      const claimLease = await claim;

      expect(claimLease.release()).toBe(false);
      expect(resources.getDisposeCount()).toBe(1);
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());
    });
  });

  describe("disposal", () => {
    test("disposal drains claim leases, claim indexes, and keyed resources", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => resources.create),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a"]),
      );

      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      expect(first.release()).toBe(false);
      expect(second.release()).toBe(false);
      expect(resources.getDisposeCount()).toBe(2);
      expect(sharedResourceByKeyWithClaims.getClaimsForResource("a")).toEqual(
        new Set(),
      );
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());
      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(0);
      expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([]);
    });

    test("disposal continues draining claim leases after one release defects", async () => {
      await using run = testCreateRun();
      const resources = createTestResources();
      const defect = new Error("claim lookup failed during drain");
      let throwForFirst = false;

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => resources.create,
          {
            claimLookup: (claim: string) => {
              if (throwForFirst && claim === "first") throw defect;
              return claim;
            },
          },
        ),
      );
      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("first", ["a"]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("second", ["b"]),
      );

      throwForFirst = true;
      let disposalError: unknown;
      try {
        await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();
      } catch (error) {
        disposalError = error;
      }
      throwForFirst = false;

      expect(disposalError).toBeDefined();
      expect(first.release()).toBe(false);
      expect(second.release()).toBe(false);
      expect(resources.getDisposeCount()).toBe(2);
      expect(sharedResourceByKeyWithClaims.getClaimsForResource("a")).toEqual(
        new Set(),
      );
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("second"),
      ).toEqual(new Set());
      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(0);
      const reportedDefects = run.deps.reportDefect.getDefectsSnapshot();
      expect(reportedDefects).toHaveLength(1);
      const reportedDefect = reportedDefects[0];
      assert(AbortError.is(reportedDefect));
      assert(reportedDefect.reason.type === "PanicAbortReason");
      expect(reportedDefect.reason.defect).toBe(defect);
    });

    test("a claim lease reports false after the registry drains it", async () => {
      await using run = testCreateRun();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      expect(claimLease.release()).toBe(false);
    });

    test("claim lease release remains safe after root Run disposal", async () => {
      const run = testCreateRun();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      await run[Symbol.asyncDispose]();

      expect(claimLease.release()).toBe(false);
      expect(claimLease.release()).toBe(false);
      run.deps.leakDetector.collect();
      expect(run.deps.console.getEntriesSnapshot()).toEqual([]);
    });

    test("relation queries are empty after root Run disposal", async () => {
      const run = testCreateRun();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      await run.ok(sharedResourceByKeyWithClaims.claim("claim", ["resource"]));

      await run[Symbol.asyncDispose]();

      expect(
        sharedResourceByKeyWithClaims.getClaimsForResource("resource"),
      ).toEqual(new Set());
      expect(
        sharedResourceByKeyWithClaims.getResourceKeysForClaim("claim"),
      ).toEqual(new Set());
      const visited: Array<string> = [];
      sharedResourceByKeyWithClaims.forEachResourceForClaim(
        "claim",
        (_resource, resourceKey) => {
          visited.push(resourceKey);
        },
      );
      expect(visited).toEqual([]);
    });

    test("late claim lease release during registry disposal is a safe no-op", async () => {
      await using run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () =>
            ok({
              [Symbol.asyncDispose]: async () => {
                disposalStarted.resolve();
                await continueDisposal.promise;
              },
            }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      const disposal = sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      try {
        await disposalStarted.promise;

        // Resource disposal starts only after the metadata drain releases the
        // final inner lease, so the ClaimLease is already drained here.
        expect(claimLease.release()).toBe(false);

        continueDisposal.resolve();
        await disposal;

        expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([]);
      } finally {
        continueDisposal.resolve();
        await disposal;
      }
    });

    test("root Run disposal awaits keyed resource disposal", async () => {
      const run = testCreateRun();
      const disposalStarted = Promise.withResolvers<void>();
      const continueDisposal = Promise.withResolvers<void>();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () =>
            ok({
              [Symbol.asyncDispose]: async () => {
                disposalStarted.resolve();
                await continueDisposal.promise;
              },
            }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      let rootDisposalSettled = false;
      const rootDisposal = run[Symbol.asyncDispose]().then(() => {
        rootDisposalSettled = true;
      });

      try {
        const firstSettled = await Promise.race([
          disposalStarted.promise.then(() => "resourceDisposalStarted"),
          rootDisposal.then(() => "rootDisposalSettled"),
        ]);

        expect(firstSettled).toBe("resourceDisposalStarted");
        expect(rootDisposalSettled).toBe(false);

        continueDisposal.resolve();
        await rootDisposal;

        expect(run.deps.reportDefect.getDefectsSnapshot()).toEqual([]);
      } finally {
        continueDisposal.resolve();
        claimLease.release();
        await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();
        await rootDisposal;
      }
    });

    test("claiming after registry disposal is a programmer error", async () => {
      await using run = testCreateRun();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBeInstanceOf(Error);
      expect((result.error.reason.defect as Error).message).toBe(
        "Cannot use a disposed object.",
      );
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("claiming after root Run disposal is a programmer error", async () => {
      const ownerRun = testCreateRun();
      const sharedResourceByKeyWithClaims = await ownerRun.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      await ownerRun[Symbol.asyncDispose]();
      await using callerRun = testCreateRun();

      const result = await callerRun.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBeInstanceOf(Error);
      expect((result.error.reason.defect as Error).message).toBe(
        "Cannot use a disposed object.",
      );
      expect(await callerRun.deps.reportDefect.next()).toBe(result.error);
    });
  });

  describe("leak detection", () => {
    test("warns when an undisposed claims registry is garbage-collected", async () => {
      await using run = testCreateRun();

      await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );

      expect(
        run.deps.leakDetector.getTrackedCount({
          name: "SharedResourceByKeyWithClaims",
        }),
      ).toBe(1);

      run.deps.leakDetector.collect();

      expect(run.deps.console.getEntriesSnapshot()).toContainEqual(
        expect.objectContaining({
          method: "warn",
          args: expect.arrayContaining([
            "SharedResourceByKeyWithClaims was garbage-collected without cleanup. Tracked at:",
          ]),
        }),
      );
    });

    test("warns when a leaked claim lease is garbage-collected", async () => {
      await using run = testCreateRun();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );

      await run.ok(sharedResourceByKeyWithClaims.claim("claim", ["resource"]));

      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(1);

      run.deps.leakDetector.collect();

      expect(run.deps.console.getEntriesSnapshot()).toContainEqual(
        expect.objectContaining({
          method: "warn",
          args: expect.arrayContaining([
            "ClaimLease was garbage-collected without cleanup. Tracked at:",
          ]),
        }),
      );
    });

    test("claim lease release untracks it", async () => {
      await using run = testCreateRun();

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      const claimLease = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(1);

      claimLease.release();

      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(0);
    });

    test("registry disposal untracks held claim leases", async () => {
      await using run = testCreateRun();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );
      await run.ok(sharedResourceByKeyWithClaims.claim("claim", ["resource"]));

      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(1);

      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      expect(
        run.deps.leakDetector.getTrackedCount({ name: "ClaimLease" }),
      ).toBe(0);
      expect(run.deps.console.getEntriesSnapshot()).toEqual([]);
    });
  });

  describe("defects", () => {
    test("throwing create Task panics the owner Run", async () => {
      await using run = testCreateRun();
      const defect = new Error("create failed");

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims((_key: string) => () => {
          throw defect;
        }),
      );

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing resource lookup panics the owner Run", async () => {
      await using run = testCreateRun();
      const defect = new Error("resource lookup failed");

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            resourceLookup: (_key): string => {
              throw defect;
            },
          },
        ),
      );

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });

    test("throwing claim lookup panics the owner Run", async () => {
      await using run = testCreateRun();
      const defect = new Error("claim lookup failed");

      await using sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
          {
            claimLookup: (_claim): string => {
              throw defect;
            },
          },
        ),
      );

      const result = await run.abortable(
        sharedResourceByKeyWithClaims.claim("claim", ["resource"]),
      );

      assert(!result.ok);
      assert(AbortError.is(result.error));
      assert(result.error.reason.type === "PanicAbortReason");
      expect(result.error.reason.defect).toBe(defect);
      expect(await run.deps.reportDefect.next()).toBe(result.error);
    });
  });

  describe("snapshot", () => {
    test("snapshot exposes pair retain counts and keyed resource states", async () => {
      await using run = testCreateRun();

      const sharedResourceByKeyWithClaims = await run.ok(
        createSharedResourceByKeyWithClaims(
          (_key: string) => () => ok({ [Symbol.dispose]: lazyVoid }),
        ),
      );

      expect(sharedResourceByKeyWithClaims.snapshot()).toEqual({
        claimLeaseCount: 0,
        retainCountsByResourceKeyByClaim: new Map(),
        resourcesByKey: new Map(),
      });

      const first = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a", "b"]),
      );
      const second = await run.ok(
        sharedResourceByKeyWithClaims.claim("claim", ["a"]),
      );
      const other = await run.ok(
        sharedResourceByKeyWithClaims.claim("other", ["a"]),
      );

      const snapshot = sharedResourceByKeyWithClaims.snapshot();
      expect(snapshot).toEqual({
        claimLeaseCount: 3,
        retainCountsByResourceKeyByClaim: new Map([
          [
            "claim",
            new Map([
              ["a", 2],
              ["b", 1],
            ]),
          ],
          ["other", new Map([["a", 1]])],
        ]),
        resourcesByKey: new Map([
          [
            "a",
            {
              isIdle: false,
              leaseCount: 3,
              hasResource: true,
              idleDisposePending: false,
              mutex: idleMutexSnapshot,
            },
          ],
          [
            "b",
            {
              isIdle: false,
              leaseCount: 1,
              hasResource: true,
              idleDisposePending: false,
              mutex: idleMutexSnapshot,
            },
          ],
        ]),
      });

      expect(second.release()).toBe(true);
      expect(
        snapshot.retainCountsByResourceKeyByClaim.get("claim")?.get("a"),
      ).toBe(2);
      expect(
        sharedResourceByKeyWithClaims
          .snapshot()
          .retainCountsByResourceKeyByClaim.get("claim")
          ?.get("a"),
      ).toBe(1);

      await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

      expect(sharedResourceByKeyWithClaims.snapshot()).toEqual({
        claimLeaseCount: 0,
        retainCountsByResourceKeyByClaim: new Map(),
        resourcesByKey: new Map(),
      });
      expect(first.release()).toBe(false);
      expect(second.release()).toBe(false);
      expect(other.release()).toBe(false);
    });
  });
});
