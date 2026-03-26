import { describe, expect, expectTypeOf, test } from "vitest";
import { structuralLookup, type StructuralLookupKey } from "../src/Lookup.js";
import {
  createResourceRef,
  createSharedResource,
  createSharedResourceByKey,
  createSharedResourceByKeyWithClaims,
  type Resource,
  type ResourceRef,
  type SharedResource,
  type SharedResourceByKey,
  type SharedResourceByKeySnapshot,
  type SharedResourceByKeyWithClaims,
} from "../src/Resource.js";
import { err, ok, type AnyResult, type Result } from "../src/Result.js";
import { runStoppedError, type AbortError, type Task } from "../src/Task.js";
import { testCreateRun, testWaitForMacrotask } from "../src/Test.js";
import { testCreateTime, type Duration } from "../src/Time.js";
import { NonNegativeInt } from "../src/Type.js";

type TestResource = {
  readonly id: string;
  readonly isDisposed: () => boolean;
} & Resource;

type DisposeKind = "sync" | "async";

const testCreateResource =
  (disposeKind: DisposeKind) =>
  (
    id: string,
    {
      onDispose,
    }: {
      onDispose?: (() => void) | undefined;
    } = {},
  ): Task<TestResource> => {
    let disposed = false;

    return () =>
      ok({
        id,
        isDisposed: () => disposed,
        ...(disposeKind === "sync"
          ? {
              [Symbol.dispose]: () => {
                disposed = true;
                onDispose?.();
              },
            }
          : {
              [Symbol.asyncDispose]: async () => {
                await testWaitForMacrotask();
                disposed = true;
                onDispose?.();
              },
            }),
      });
  };

const expectRunStopped = async (result: PromiseLike<AnyResult>) => {
  expect(await result).toEqual(
    err({ type: "AbortError", reason: runStoppedError }),
  );
};

interface TestRunSnapshot {
  readonly children: ReadonlyArray<TestRunSnapshot>;
}

const countRunDescendants = (snapshot: TestRunSnapshot): number =>
  snapshot.children.reduce(
    (count, child) => count + 1 + countRunDescendants(child),
    0,
  );

const ownerTransportLookup = (key: {
  readonly ownerId: string;
  readonly transport: string;
}): StructuralLookupKey => structuralLookup(key);

const transportLookup = (key: {
  readonly transport: string;
}): StructuralLookupKey => structuralLookup(key);

const ownerClaimLookup = (claim: {
  readonly ownerId: string;
}): StructuralLookupKey => structuralLookup(claim);

const encryptedOwnerClaimLookup = (claim: {
  readonly ownerId: string;
  readonly encryptionKey: string;
}): StructuralLookupKey => structuralLookup(claim);

const createThrowingResource = (
  disposeKind: DisposeKind,
  disposeError: Error,
): Task<TestResource> => {
  let disposed = false;

  return () =>
    ok({
      id: "resource-1",
      isDisposed: () => disposed,
      ...(disposeKind === "sync"
        ? {
            [Symbol.dispose]: () => {
              disposed = true;
              throw disposeError;
            },
          }
        : {
            [Symbol.asyncDispose]: async () => {
              await testWaitForMacrotask();
              disposed = true;
              throw disposeError;
            },
          }),
    });
};

describe("createResourceRef", () => {
  const createInitializedResourceRef =
    <D>(
      createResource: (id: string) => Task<TestResource, never, D>,
      id = "resource-1",
    ): Task<
      {
        readonly resource: TestResource;
        readonly resourceRef: ResourceRef<TestResource, D>;
      },
      never,
      D
    > =>
    async (run) => {
      const resource = await run.orThrow(createResource(id));
      const resourceRef = await run.orThrow(
        createResourceRef(() => ok(resource)),
      );
      return ok({ resource, resourceRef });
    };

  test("types require non-failing create Tasks", () => {
    expectTypeOf<typeof createResourceRef>().toEqualTypeOf<
      <T extends Disposable | AsyncDisposable, D>(
        create: Task<T, never, D>,
      ) => Task<ResourceRef<T, D>, never, D>
    >();

    expectTypeOf<ResourceRef<TestResource>["set"]>().toEqualTypeOf<
      (create: Task<TestResource>) => Task<void>
    >();
  });

  test("create returns AbortError on Run disposal", async () => {
    const run = testCreateRun();

    const createStarted = Promise.withResolvers<void>();
    const createFiber = run(
      createResourceRef(
        (run) =>
          new Promise<Result<TestResource, AbortError>>((resolve) => {
            createStarted.resolve();
            run.onAbort((reason) => {
              resolve(err({ type: "AbortError", reason }));
            });
          }),
      ),
    );

    await createStarted.promise;
    await run[Symbol.asyncDispose]();

    await expectRunStopped(createFiber);
    expect(run.getChildren().size).toBe(0);
  });

  for (const { label, disposeKind, createResource } of [
    {
      label: "with sync dispose",
      disposeKind: "sync",
      createResource: testCreateResource("sync"),
    },
    {
      label: "with async dispose",
      disposeKind: "async",
      createResource: testCreateResource("async"),
    },
  ] as const) {
    describe(label, () => {
      test("get returns the initial borrowed resource", async () => {
        await using run = testCreateRun();

        await using resourceRef = await run.orThrow(
          createResourceRef(createResource("resource-1")),
        );

        const current = await run.orThrow(resourceRef.get);

        expectTypeOf(current).toEqualTypeOf<
          Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
        >();

        expect(current.id).toBe("resource-1");
        expect(current.isDisposed()).toBe(false);
      });

      test("create completes despite caller abort", async () => {
        await using run = testCreateRun();

        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        const resource = await run.orThrow(createResource("resource-1"));
        const createFiber = run(
          createResourceRef(async () => {
            createStarted.resolve();
            await createCanFinish.promise;
            return ok(resource);
          }),
        );

        await createStarted.promise;
        createFiber.abort("stop");
        createCanFinish.resolve();

        const resourceRefResult = await createFiber;

        expect(resourceRefResult.ok).toBe(true);
        if (!resourceRefResult.ok) return;

        await using resourceRef = resourceRefResult.value;
        expect(await run.orThrow(resourceRef.get)).toBe(resource);
        expect(resource.isDisposed()).toBe(false);
      });

      test("create aborts on a stopped root Run", async () => {
        const run = testCreateRun();
        await run[Symbol.asyncDispose]();

        await expectRunStopped(
          run(createResourceRef(createResource("resource-1"))),
        );
      });

      test("set sets the next resource", async () => {
        await using run = testCreateRun();

        const initialResource = await run.orThrow(createResource("resource-0"));
        await using resourceRef = await run.orThrow(
          createResourceRef(() => ok(initialResource)),
        );

        const resource = await run.orThrow(createResource("resource-1"));

        await run.orThrow(resourceRef.set(() => ok(resource)));
        const current = await run.orThrow(resourceRef.get);

        expect(initialResource.isDisposed()).toBe(true);
        expect(current.id).toBe(resource.id);
        expect(resource.isDisposed()).toBe(false);
      });

      test("set completes replacement despite abort", async () => {
        await using run = testCreateRun();

        const { resource, resourceRef } = await run.orThrow(
          createInitializedResourceRef(createResource),
        );
        await using _resourceRef = resourceRef;

        const acquisitionStarted = Promise.withResolvers<void>();
        const next = await run.orThrow(createResource("resource-2"));
        const acquisitionCanFinish = Promise.withResolvers<void>();
        const setFiber = run(
          resourceRef.set(async () => {
            acquisitionStarted.resolve();
            await acquisitionCanFinish.promise;
            return ok(next);
          }),
        );

        await acquisitionStarted.promise;
        expect(resource.isDisposed()).toBe(true);

        setFiber.abort("stop");
        acquisitionCanFinish.resolve();

        expect(await setFiber).toEqual(ok());
        expect(await run.orThrow(resourceRef.get)).toBe(next);
        expect(resource.isDisposed()).toBe(true);
        expect(next.isDisposed()).toBe(false);
      });

      test("get waits for an in-flight set and observes the next resource", async () => {
        await using run = testCreateRun();

        const { resource, resourceRef } = await run.orThrow(
          createInitializedResourceRef(createResource),
        );
        await using _resourceRef = resourceRef;

        const next = await run.orThrow(createResource("resource-2"));
        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        const setFiber = run(
          resourceRef.set(async () => {
            createStarted.resolve();
            await createCanFinish.promise;
            return ok(next);
          }),
        );

        await createStarted.promise;
        expect(resource.isDisposed()).toBe(true);

        let getResolved = false;
        const getFiber = run(resourceRef.get).then((result) => {
          getResolved = true;
          return result;
        });

        expect(getResolved).toBe(false);

        createCanFinish.resolve();

        expect(await setFiber).toEqual(ok());
        expect(await getFiber).toEqual(ok(next));
      });

      test("set aborts before installing the next resource when the ref is disposed", async () => {
        await using run = testCreateRun();

        const { resource, resourceRef } = await run.orThrow(
          createInitializedResourceRef(createResource),
        );

        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        await using next = await run.orThrow(createResource("resource-2"));
        const setFiber = run(
          resourceRef.set(async () => {
            createStarted.resolve();
            await createCanFinish.promise;
            return ok(next);
          }),
        );

        await createStarted.promise;
        const disposeRefPromise = resourceRef[Symbol.asyncDispose]();
        createCanFinish.resolve();

        await expectRunStopped(setFiber);
        await disposeRefPromise;

        expect(resource.isDisposed()).toBe(true);
        expect(next.isDisposed()).toBe(false);
      });

      test("dispose disposes the current resource", async () => {
        await using run = testCreateRun();

        const current = await run.orThrow(createResource("resource-1"));
        const resourceRef = await run.orThrow(
          createResourceRef(() => ok(current)),
        );

        await resourceRef[Symbol.asyncDispose]();
        await resourceRef[Symbol.asyncDispose]();

        expect(current.isDisposed()).toBe(true);
      });

      test("dispose aborts later operations", async () => {
        await using run = testCreateRun();

        const { resource, resourceRef } = await run.orThrow(
          createInitializedResourceRef(createResource),
        );

        await resourceRef[Symbol.asyncDispose]();

        expect(resource.isDisposed()).toBe(true);
        await expectRunStopped(run(resourceRef.get));

        await using next = await run.orThrow(createResource("resource-2"));

        await expectRunStopped(run(resourceRef.set(() => ok(next))));
        expect(next.isDisposed()).toBe(false);
      });

      test("root Run disposal aborts later operations until the ref is disposed", async () => {
        const run = testCreateRun();

        const { resource, resourceRef } = await run.orThrow(
          createInitializedResourceRef(createResource),
        );

        await run[Symbol.asyncDispose]();

        expect(resource.isDisposed()).toBe(false);

        await using checkRun = testCreateRun();
        await expectRunStopped(checkRun(resourceRef.get));

        await using next = await checkRun.orThrow(createResource("resource-2"));
        await expectRunStopped(checkRun(resourceRef.set(() => ok(next))));
        expect(next.isDisposed()).toBe(false);

        await resourceRef[Symbol.asyncDispose]();
        expect(resource.isDisposed()).toBe(true);
      });

      test("root Run disposal aborts set after current is disposed", async () => {
        const run = testCreateRun();

        const { resource, resourceRef } = await run.orThrow(
          createInitializedResourceRef(createResource),
        );

        const createStarted = Promise.withResolvers<void>();
        const setFiber = run(
          resourceRef.set(
            (run) =>
              new Promise<Result<TestResource, AbortError>>((resolve) => {
                createStarted.resolve();
                run.onAbort((reason) => {
                  resolve(err({ type: "AbortError", reason }));
                });
              }),
          ),
        );

        await createStarted.promise;
        expect(resource.isDisposed()).toBe(true);

        await run[Symbol.asyncDispose]();

        await expectRunStopped(setFiber);

        await using checkRun = testCreateRun();
        await expectRunStopped(checkRun(resourceRef.get));
      });

      test("dispose still aborts later operations when current disposal throws", async () => {
        await using run = testCreateRun();

        const disposeError = new Error("dispose failed");
        const resourceRef = await run.orThrow(
          createResourceRef(createThrowingResource(disposeKind, disposeError)),
        );

        await expect(resourceRef[Symbol.asyncDispose]()).rejects.toBe(
          disposeError,
        );

        await expectRunStopped(run(resourceRef.get));
      });
    });
  }
});

describe("createSharedResource", () => {
  const createInitializedSharedResource =
    <D>(
      createResource: (id: string) => Task<TestResource, never, D>,
      id = "resource-1",
    ): Task<
      {
        readonly resource: TestResource;
        readonly sharedResource: SharedResource<TestResource, D>;
      },
      never,
      D
    > =>
    async (run) => {
      const resource = await run.orThrow(createResource(id));
      const sharedResource = await run.orThrow(
        createSharedResource(() => ok(resource)),
      );
      return ok({ resource, sharedResource });
    };

  test("types require non-failing create Tasks", () => {
    const _createSharedResource: <T extends Disposable | AsyncDisposable, D>(
      create: Task<T, never, D>,
      options?: {
        idleDisposeAfter?: Duration;
        onDisposed?: () => void;
      },
    ) => Task<SharedResource<T, D>, never, D> = createSharedResource;

    expectTypeOf(_createSharedResource).toBeFunction();

    expectTypeOf<SharedResource<TestResource>["acquire"]>().toEqualTypeOf<
      Task<
        Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
      >
    >();

    expectTypeOf<SharedResource<TestResource>["get"]>().toEqualTypeOf<
      () =>
        | Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
        | undefined
    >();

    expectTypeOf<SharedResource<TestResource>["release"]>().toEqualTypeOf<
      Task<void>
    >();

    expectTypeOf<SharedResource<TestResource>["getCount"]>().toEqualTypeOf<
      Task<NonNegativeInt>
    >();
  });

  test("create aborts on a stopped root Run", async () => {
    const run = testCreateRun();
    await run[Symbol.asyncDispose]();

    await expectRunStopped(
      run(createSharedResource(testCreateResource("sync")("r1"))),
    );
  });

  test("acquire aborts before publishing a resource when the shared resource is disposed", async () => {
    await using run = testCreateRun();

    const createStarted = Promise.withResolvers<void>();
    const createCanFinish = Promise.withResolvers<void>();
    await using resource = await run.orThrow(testCreateResource("sync")("r1"));
    const sharedResource = await run.orThrow(
      createSharedResource(
        (run) =>
          new Promise<Result<TestResource, AbortError>>((resolve) => {
            createStarted.resolve();
            run.onAbort((reason) => {
              resolve(err({ type: "AbortError", reason }));
            });

            void createCanFinish.promise.then(() => {
              resolve(ok(resource));
            });
          }),
      ),
    );

    const acquireFiber = run(sharedResource.acquire);

    await createStarted.promise;
    const disposePromise = sharedResource[Symbol.asyncDispose]();
    createCanFinish.resolve();

    await expectRunStopped(acquireFiber);
    await disposePromise;

    expect(resource.isDisposed()).toBe(false);
  });

  for (const { label, disposeKind, createResource } of [
    {
      label: "with sync dispose",
      disposeKind: "sync",
      createResource: testCreateResource("sync"),
    },
    {
      label: "with async dispose",
      disposeKind: "async",
      createResource: testCreateResource("async"),
    },
  ] as const) {
    describe(label, () => {
      test("acquire lazily creates the resource and increments count", async () => {
        await using run = testCreateRun();

        let createCallCount = 0;
        await using sharedResource = await run.orThrow(
          createSharedResource(async (run) => {
            createCallCount += 1;
            return run(createResource("resource-1"));
          }),
        );

        expect(sharedResource.get()).toBeUndefined();
        expect(await run.orThrow(sharedResource.getCount)).toBe(0);

        const resource = await run.orThrow(sharedResource.acquire);

        expect(resource.id).toBe("resource-1");
        expect(sharedResource.get()).toBe(resource);
        expect(resource.isDisposed()).toBe(false);
        expect(createCallCount).toBe(1);
        expect(await run.orThrow(sharedResource.getCount)).toBe(1);
      });

      test("acquire reuses the current resource across callers", async () => {
        await using run = testCreateRun();

        let createCallCount = 0;
        await using sharedResource = await run.orThrow(
          createSharedResource(async (run) => {
            createCallCount += 1;
            return run(createResource("resource-1"));
          }),
        );

        const first = await run.orThrow(sharedResource.acquire);
        const second = await run.orThrow(sharedResource.acquire);

        expect(first).toBe(second);
        expect(createCallCount).toBe(1);
        expect(await run.orThrow(sharedResource.getCount)).toBe(2);
      });

      test("concurrent first acquires share one resource creation", async () => {
        await using run = testCreateRun();

        let createCallCount = 0;
        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        await using sharedResource = await run.orThrow(
          createSharedResource(async (run) => {
            createCallCount += 1;
            createStarted.resolve();
            await createCanFinish.promise;
            return run(createResource("resource-1"));
          }),
        );

        let firstResolved = false;
        const firstAcquire = run(sharedResource.acquire).then((result) => {
          firstResolved = true;
          return result;
        });

        await createStarted.promise;

        let secondResolved = false;
        const secondAcquire = run(sharedResource.acquire).then((result) => {
          secondResolved = true;
          return result;
        });

        expect(firstResolved).toBe(false);
        expect(secondResolved).toBe(false);
        expect(createCallCount).toBe(1);

        createCanFinish.resolve();

        const first = await run.orThrow(() => firstAcquire);
        const second = await run.orThrow(() => secondAcquire);

        expect(first).toBe(second);
        expect(createCallCount).toBe(1);
        expect(await run.orThrow(sharedResource.getCount)).toBe(2);
      });

      test("release decrements count and disposes on the last release", async () => {
        await using run = testCreateRun();

        const { resource, sharedResource } = await run.orThrow(
          createInitializedSharedResource(createResource),
        );
        await using _sharedResource = sharedResource;

        const first = await run.orThrow(sharedResource.acquire);
        const second = await run.orThrow(sharedResource.acquire);

        expect(first).toBe(second);
        expect(resource.isDisposed()).toBe(false);

        await run.orThrow(sharedResource.release);

        expect(await run.orThrow(sharedResource.getCount)).toBe(1);
        expect(resource.isDisposed()).toBe(false);

        await run.orThrow(sharedResource.release);

        expect(await run.orThrow(sharedResource.getCount)).toBe(0);
        expect(resource.isDisposed()).toBe(true);
      });

      test("acquire creates a fresh resource after the last release", async () => {
        await using run = testCreateRun();

        let createCallCount = 0;
        await using sharedResource = await run.orThrow(
          createSharedResource(async (run) => {
            createCallCount += 1;
            return run(createResource(`resource-${createCallCount}`));
          }),
        );

        const first = await run.orThrow(sharedResource.acquire);
        expect(first.id).toBe("resource-1");

        await run.orThrow(sharedResource.release);

        expect(first.isDisposed()).toBe(true);
        expect(await run.orThrow(sharedResource.getCount)).toBe(0);

        const second = await run.orThrow(sharedResource.acquire);

        expect(second).not.toBe(first);
        expect(second.id).toBe("resource-2");
        expect(second.isDisposed()).toBe(false);
        expect(createCallCount).toBe(2);
        expect(await run.orThrow(sharedResource.getCount)).toBe(1);
      });

      describe("idleDisposeAfter", () => {
        test("release keeps the resource alive until idleDisposeAfter elapses", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          const disposed = Promise.withResolvers<void>();
          const resource = await run.orThrow(
            createResource("resource-1", {
              onDispose: disposed.resolve,
            }),
          );
          await using sharedResource = await run.orThrow(
            createSharedResource(() => ok(resource), {
              idleDisposeAfter: "10ms",
            }),
          );

          await run.orThrow(sharedResource.acquire);
          await run.orThrow(sharedResource.release);

          expect(sharedResource.get()).toBe(resource);
          expect(resource.isDisposed()).toBe(false);

          time.advance("10ms");
          await disposed.promise;

          expect(sharedResource.get()).toBeUndefined();
          expect(resource.isDisposed()).toBe(true);
        });

        test("release disposes after idleDisposeAfter elapses", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          const disposed = Promise.withResolvers<void>();
          const resource = await run.orThrow(
            createResource("resource-1", {
              onDispose: disposed.resolve,
            }),
          );
          await using sharedResource = await run.orThrow(
            createSharedResource(() => ok(resource), {
              idleDisposeAfter: "10ms",
            }),
          );

          await run.orThrow(sharedResource.acquire);
          await run.orThrow(sharedResource.release);

          expect(await run.orThrow(sharedResource.getCount)).toBe(0);
          expect(resource.isDisposed()).toBe(false);

          time.advance("9ms");
          expect(resource.isDisposed()).toBe(false);

          time.advance("1ms");
          await disposed.promise;
          expect(resource.isDisposed()).toBe(true);
        });

        test("acquire cancels pending idle disposal and reuses the current resource", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          let createCallCount = 0;
          const disposed = Promise.withResolvers<void>();
          await using sharedResource = await run.orThrow(
            createSharedResource(
              async (run) => {
                createCallCount += 1;
                return run(
                  createResource(`resource-${createCallCount}`, {
                    onDispose:
                      createCallCount === 1 ? disposed.resolve : undefined,
                  }),
                );
              },
              {
                idleDisposeAfter: "10ms",
              },
            ),
          );

          const first = await run.orThrow(sharedResource.acquire);
          await run.orThrow(sharedResource.release);

          time.advance("9ms");
          const second = await run.orThrow(sharedResource.acquire);

          expect(second).toBe(first);
          expect(first.isDisposed()).toBe(false);
          expect(createCallCount).toBe(1);
          expect(await run.orThrow(sharedResource.getCount)).toBe(1);

          time.advance("10ms");
          expect(first.isDisposed()).toBe(false);

          await run.orThrow(sharedResource.release);
          time.advance("10ms");
          await disposed.promise;
          expect(first.isDisposed()).toBe(true);
        });

        test("acquire after timeout fires cancels the stale idle disposal", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          let createCallCount = 0;
          await using sharedResource = await run.orThrow(
            createSharedResource(
              async (run) => {
                createCallCount += 1;
                return run(createResource(`resource-${createCallCount}`));
              },
              {
                idleDisposeAfter: "10ms",
              },
            ),
          );

          const first = await run.orThrow(sharedResource.acquire);
          await run.orThrow(sharedResource.release);

          time.advance("10ms");
          const second = await run.orThrow(sharedResource.acquire);

          expect(second).toBe(first);
          expect(createCallCount).toBe(1);
          expect(await run.orThrow(sharedResource.getCount)).toBe(1);

          expect(first.isDisposed()).toBe(false);
        });

        test("dispose cancels pending idle disposal and disposes immediately", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          const resource = await run.orThrow(createResource("resource-1"));
          const sharedResource = await run.orThrow(
            createSharedResource(() => ok(resource), {
              idleDisposeAfter: "10ms",
            }),
          );

          await run.orThrow(sharedResource.acquire);
          await run.orThrow(sharedResource.release);

          expect(resource.isDisposed()).toBe(false);

          await sharedResource[Symbol.asyncDispose]();
          expect(resource.isDisposed()).toBe(true);
        });
      });

      test("acquire completes resource creation despite caller abort", async () => {
        await using run = testCreateRun();

        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        const resource = await run.orThrow(createResource("resource-1"));
        await using sharedResource = await run.orThrow(
          createSharedResource(async () => {
            createStarted.resolve();
            await createCanFinish.promise;
            return ok(resource);
          }),
        );

        const acquireFiber = run(sharedResource.acquire);

        await createStarted.promise;
        acquireFiber.abort("stop");
        createCanFinish.resolve();

        expect(await acquireFiber).toEqual(ok(resource));
        expect(await run.orThrow(sharedResource.getCount)).toBe(1);
        expect(resource.isDisposed()).toBe(false);
      });

      test("dispose disposes the current resource and aborts later operations", async () => {
        await using run = testCreateRun();

        const { resource, sharedResource } = await run.orThrow(
          createInitializedSharedResource(createResource),
        );

        await run.orThrow(sharedResource.acquire);
        await sharedResource[Symbol.asyncDispose]();
        await sharedResource[Symbol.asyncDispose]();

        expect(resource.isDisposed()).toBe(true);
        await expectRunStopped(run(sharedResource.acquire));
        await expectRunStopped(run(sharedResource.release));
        await expectRunStopped(run(sharedResource.getCount));
      });

      test("dispose still aborts later operations when current disposal throws", async () => {
        await using run = testCreateRun();

        const disposeError = new Error("dispose failed");
        const sharedResource = await run.orThrow(
          createSharedResource(
            createThrowingResource(disposeKind, disposeError),
          ),
        );

        await run.orThrow(sharedResource.acquire);

        await expect(sharedResource[Symbol.asyncDispose]()).rejects.toBe(
          disposeError,
        );

        await expectRunStopped(run(sharedResource.acquire));
        await expectRunStopped(run(sharedResource.release));
        await expectRunStopped(run(sharedResource.getCount));
      });

      test("root Run disposal aborts later operations until the shared resource is disposed", async () => {
        const run = testCreateRun();

        const { resource, sharedResource } = await run.orThrow(
          createInitializedSharedResource(createResource),
        );

        await run.orThrow(sharedResource.acquire);
        await run[Symbol.asyncDispose]();

        expect(resource.isDisposed()).toBe(false);

        await using checkRun = testCreateRun();
        await expectRunStopped(checkRun(sharedResource.acquire));
        await expectRunStopped(checkRun(sharedResource.release));
        await expectRunStopped(checkRun(sharedResource.getCount));

        await sharedResource[Symbol.asyncDispose]();
        expect(resource.isDisposed()).toBe(true);
      });

      test("release throws on over-release", async () => {
        await using run = testCreateRun();

        await using sharedResource = await run.orThrow(
          createSharedResource(createResource("resource-1")),
        );

        await expect(run(sharedResource.release)).rejects.toThrow(
          "RefCount must not be decremented below zero.",
        );
      });
    });
  }
});

describe("createSharedResourceByKey", () => {
  test("types require non-failing keyed create Tasks", () => {
    expectTypeOf<typeof createSharedResourceByKey>().toBeFunction();

    expectTypeOf<
      SharedResourceByKey<"a", TestResource>["acquire"]
    >().toEqualTypeOf<
      (
        key: "a",
      ) => Task<
        Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
      >
    >();

    expectTypeOf<SharedResourceByKey<"a", TestResource>["get"]>().toEqualTypeOf<
      (
        key: "a",
      ) =>
        | Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
        | undefined
    >();

    expectTypeOf<
      SharedResourceByKey<"a", TestResource>["release"]
    >().toEqualTypeOf<(key: "a") => Task<void>>();

    expectTypeOf<
      SharedResourceByKey<"a", TestResource>["getCount"]
    >().toEqualTypeOf<(key: "a") => Task<NonNegativeInt>>();

    expectTypeOf<
      SharedResourceByKey<"a", TestResource>["snapshot"]
    >().toEqualTypeOf<() => SharedResourceByKeySnapshot<"a", TestResource>>();
  });

  test("create aborts on a stopped root Run", async () => {
    const run = testCreateRun();
    await run[Symbol.asyncDispose]();

    await expectRunStopped(
      run(
        createSharedResourceByKey((key: string) =>
          testCreateResource("sync")(key),
        ),
      ),
    );
  });

  test("uses reference identity for equal object keys by default", async () => {
    await using run = testCreateRun();

    const createCalls: Array<string> = [];
    await using sharedResourceByKey = await run.orThrow(
      createSharedResourceByKey(
        (key: { readonly ownerId: string; readonly transport: string }) => {
          createCalls.push(`${key.ownerId}:${key.transport}`);
          return testCreateResource("sync")(`${key.ownerId}:${key.transport}`);
        },
      ),
    );

    const firstKey = { ownerId: "a", transport: "ws" };
    const secondKey = { transport: "ws", ownerId: "a" };

    const first = await run.orThrow(sharedResourceByKey.acquire(firstKey));
    const second = await run.orThrow(sharedResourceByKey.acquire(secondKey));

    expect(first).not.toBe(second);
    expect(createCalls).toEqual(["a:ws", "a:ws"]);
    expect(await run.orThrow(sharedResourceByKey.getCount(firstKey))).toBe(1);
    expect(await run.orThrow(sharedResourceByKey.getCount(secondKey))).toBe(1);
  });

  test("supports custom lookup functions with typed keys", async () => {
    await using run = testCreateRun();

    await using sharedResourceByKey = await run.orThrow(
      createSharedResourceByKey(
        (key: { readonly ownerId: string; readonly transport: string }) =>
          testCreateResource("sync")(`${key.ownerId}:${key.transport}`),
        { lookup: ownerTransportLookup },
      ),
    );

    // @ts-expect-error lookup constrains accepted key types
    sharedResourceByKey.get("a");

    const resource = await run.orThrow(
      sharedResourceByKey.acquire({ ownerId: "a", transport: "ws" }),
    );

    const equivalent = { transport: "ws", ownerId: "a" };
    const sameResource = await run.orThrow(
      sharedResourceByKey.acquire(equivalent),
    );

    expect(sameResource).toBe(resource);

    await run.orThrow(sharedResourceByKey.release(equivalent));

    expect(resource.isDisposed()).toBe(false);
    expect(
      await run.orThrow(
        sharedResourceByKey.getCount({ ownerId: "a", transport: "ws" }),
      ),
    ).toBe(1);
  });

  test("custom lookup releases and disposes symmetrically", async () => {
    await using run = testCreateRun();

    await using sharedResourceByKey = await run.orThrow(
      createSharedResourceByKey(
        (key: { readonly ownerId: string; readonly transport: string }) =>
          testCreateResource("sync")(`${key.ownerId}:${key.transport}`),
        { lookup: ownerTransportLookup },
      ),
    );

    const resource = await run.orThrow(
      sharedResourceByKey.acquire({ ownerId: "a", transport: "ws" }),
    );

    await run.orThrow(
      sharedResourceByKey.release({ transport: "ws", ownerId: "a" }),
    );

    expect(resource.isDisposed()).toBe(true);
    expect(
      await run.orThrow(
        sharedResourceByKey.getCount({ ownerId: "a", transport: "ws" }),
      ),
    ).toBe(0);
  });

  for (const { label, disposeKind, createResource } of [
    {
      label: "with sync dispose",
      disposeKind: "sync",
      createResource: testCreateResource("sync"),
    },
    {
      label: "with async dispose",
      disposeKind: "async",
      createResource: testCreateResource("async"),
    },
  ] as const) {
    describe(label, () => {
      test("acquire creates once per key and reuses the current resource", async () => {
        await using run = testCreateRun();

        const createCalls: Array<string> = [];
        const createKeyedResource =
          (key: string): Task<TestResource> =>
          async (run) => {
            createCalls.push(key);
            return run(createResource(key));
          };
        await using sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey(createKeyedResource),
        );

        expect(sharedResourceByKey.get("a")).toBeUndefined();
        const first = await run.orThrow(sharedResourceByKey.acquire("a"));
        const second = await run.orThrow(sharedResourceByKey.acquire("a"));

        expect(first).toBe(second);
        expect(sharedResourceByKey.get("a")).toBe(first);
        expect(first.id).toBe("a");
        expect(createCalls).toEqual(["a"]);
        expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(2);
        expect(await run.orThrow(sharedResourceByKey.getCount("b"))).toBe(0);
      });

      describe("snapshot", () => {
        test("exposes current resources and keyed mutex state", async () => {
          await using run = testCreateRun();

          await using sharedResourceByKey = await run.orThrow(
            createSharedResourceByKey((key: string) => createResource(key)),
          );

          expect(sharedResourceByKey.snapshot()).toEqual({
            resourcesByKey: new Map(),
            mutexByKey: new Map(),
          });

          const resourceA = await run.orThrow(sharedResourceByKey.acquire("a"));
          const resourceB = await run.orThrow(sharedResourceByKey.acquire("b"));

          const snapshot = sharedResourceByKey.snapshot();

          expect(snapshot.resourcesByKey).toEqual(
            new Map([
              ["a", resourceA],
              ["b", resourceB],
            ]),
          );
          expect(snapshot.mutexByKey).toEqual(
            new Map([
              ["a", null],
              ["b", null],
            ]),
          );
        });

        test("skips keys whose first acquire has not produced a resource yet", async () => {
          await using run = testCreateRun();

          const createStarted = Promise.withResolvers<void>();
          const allowCreate = Promise.withResolvers<void>();

          const createKeyedResource =
            (key: string): Task<TestResource> =>
            async (run) => {
              createStarted.resolve();
              await allowCreate.promise;
              return run(createResource(key));
            };

          await using createdSharedResourceByKey = await run.orThrow(
            createSharedResourceByKey(createKeyedResource),
          );

          const acquire = run(createdSharedResourceByKey.acquire("a"));

          await createStarted.promise;

          expect(createdSharedResourceByKey.snapshot()).toEqual({
            resourcesByKey: new Map(),
            mutexByKey: new Map(),
          });

          allowCreate.resolve();
          await expect(acquire).resolves.toMatchObject({ ok: true });
        });
      });

      test("different keys keep independent resources and counts", async () => {
        await using run = testCreateRun();

        let createCallCount = 0;
        const createKeyedResource =
          (key: string): Task<TestResource> =>
          async (run) => {
            createCallCount += 1;
            return run(createResource(`resource-${key}`));
          };
        await using sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey(createKeyedResource),
        );

        const first = await run.orThrow(sharedResourceByKey.acquire("a"));
        const second = await run.orThrow(sharedResourceByKey.acquire("b"));

        expect(first).not.toBe(second);
        expect(first.id).toBe("resource-a");
        expect(second.id).toBe("resource-b");
        expect(createCallCount).toBe(2);
        expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(1);
        expect(await run.orThrow(sharedResourceByKey.getCount("b"))).toBe(1);
      });

      test("concurrent first acquires for the same key share one creation", async () => {
        await using run = testCreateRun();

        let createCallCount = 0;
        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        const createKeyedResource =
          (key: string): Task<TestResource> =>
          async (run) => {
            createCallCount += 1;
            createStarted.resolve();
            await createCanFinish.promise;
            return run(createResource(key));
          };
        await using sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey(createKeyedResource),
        );

        let firstResolved = false;
        const firstAcquire = run(sharedResourceByKey.acquire("a")).then(
          (result) => {
            firstResolved = true;
            return result;
          },
        );

        await createStarted.promise;

        let secondResolved = false;
        const secondAcquire = run(sharedResourceByKey.acquire("a")).then(
          (result) => {
            secondResolved = true;
            return result;
          },
        );

        expect(firstResolved).toBe(false);
        expect(secondResolved).toBe(false);
        expect(createCallCount).toBe(1);

        createCanFinish.resolve();

        const firstResult = await firstAcquire;
        const secondResult = await secondAcquire;

        expect(firstResult.ok).toBe(true);
        expect(secondResult.ok).toBe(true);
        if (!firstResult.ok || !secondResult.ok) return;

        expect(firstResult.value).toBe(secondResult.value);
        expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(2);
      });

      test("release decrements count and disposes on the last release", async () => {
        await using run = testCreateRun();

        await using sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey((key: string) => createResource(key)),
        );

        const resource = await run.orThrow(sharedResourceByKey.acquire("a"));
        await run.orThrow(sharedResourceByKey.acquire("a"));

        await run.orThrow(sharedResourceByKey.release("a"));
        expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(1);
        expect(resource.isDisposed()).toBe(false);

        await run.orThrow(sharedResourceByKey.release("a"));
        expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(0);
        expect(resource.isDisposed()).toBe(true);

        const next = await run.orThrow(sharedResourceByKey.acquire("a"));
        expect(next).not.toBe(resource);
      });

      describe("idleDisposeAfter", () => {
        test("idle eviction disposes the removed keyed shared-resource wrapper", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          const disposed = Promise.withResolvers<void>();
          await using sharedResourceByKey = await run.orThrow(
            createSharedResourceByKey((key: string) => createResource(key), {
              idleDisposeAfter: "10ms",
              onDisposed: () => {
                disposed.resolve();
              },
            }),
          );

          expect(countRunDescendants(run.snapshot())).toBe(1);

          await run.orThrow(sharedResourceByKey.acquire("a"));
          expect(countRunDescendants(run.snapshot())).toBe(2);

          await run.orThrow(sharedResourceByKey.release("a"));

          time.advance("10ms");
          await disposed.promise;
          await testWaitForMacrotask();

          expect(countRunDescendants(run.snapshot())).toBe(1);
        });

        test("onDisposed fires when a key's resource is disposed", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          const disposedKeys: Array<string> = [];
          const onDisposedCalled = Promise.withResolvers<void>();
          await using sharedResourceByKey = await run.orThrow(
            createSharedResourceByKey((key: string) => createResource(key), {
              idleDisposeAfter: "10ms",
              onDisposed: (key) => {
                disposedKeys.push(key);
                onDisposedCalled.resolve();
              },
            }),
          );

          await run.orThrow(sharedResourceByKey.acquire("a"));
          await run.orThrow(sharedResourceByKey.release("a"));

          expect(sharedResourceByKey.get("a")?.id).toBe("a");
          expect(disposedKeys).toEqual([]);

          time.advance("10ms");
          await onDisposedCalled.promise;

          expect(sharedResourceByKey.get("a")).toBeUndefined();
          expect(disposedKeys).toEqual(["a"]);
        });

        test("release disposes after idleDisposeAfter elapses and reacquire cancels it", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          let createCallCount = 0;
          const firstDisposed = Promise.withResolvers<void>();
          const createKeyedResource =
            (key: string): Task<TestResource> =>
            async (run) => {
              createCallCount += 1;
              return run(
                createResource(`${key}-${createCallCount}`, {
                  onDispose:
                    createCallCount === 1
                      ? () => {
                          firstDisposed.resolve();
                        }
                      : undefined,
                }),
              );
            };
          await using sharedResourceByKey = await run.orThrow(
            createSharedResourceByKey(createKeyedResource, {
              idleDisposeAfter: "10ms",
            }),
          );

          const first = await run.orThrow(sharedResourceByKey.acquire("a"));
          await run.orThrow(sharedResourceByKey.release("a"));

          time.advance("9ms");
          const second = await run.orThrow(sharedResourceByKey.acquire("a"));

          expect(second).toBe(first);
          expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(1);

          await run.orThrow(sharedResourceByKey.release("a"));
          time.advance("10ms");
          await firstDisposed.promise;

          expect(first.isDisposed()).toBe(true);
          expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(0);

          const third = await run.orThrow(sharedResourceByKey.acquire("a"));
          expect(third).not.toBe(first);
          expect(createCallCount).toBe(2);
        });

        test("dispose cancels pending keyed idle disposal and disposes current resources", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          const resource = await run.orThrow(createResource("a"));
          const sharedResourceByKey = await run.orThrow(
            createSharedResourceByKey(() => () => ok(resource), {
              idleDisposeAfter: "10ms",
            }),
          );

          await run.orThrow(sharedResourceByKey.acquire("a"));
          await run.orThrow(sharedResourceByKey.release("a"));

          await sharedResourceByKey[Symbol.asyncDispose]();

          expect(resource.isDisposed()).toBe(true);
        });

        test("stale disposal callback must not remove a key that is reacquired concurrently", async () => {
          const time = testCreateTime();
          await using run = testCreateRun({ time });

          let createCallCount = 0;
          const firstDisposeStarted = Promise.withResolvers<void>();
          const firstDisposeCanFinish = Promise.withResolvers<void>();

          const createKeyedResource =
            (key: string): Task<TestResource> =>
            () => {
              createCallCount += 1;

              let disposed = false;
              const resourceId = `${key}-${createCallCount}`;
              const isFirstResource = createCallCount === 1;

              return ok({
                id: resourceId,
                isDisposed: () => disposed,
                [Symbol.asyncDispose]: async () => {
                  if (isFirstResource) {
                    firstDisposeStarted.resolve();
                    await firstDisposeCanFinish.promise;
                  }
                  disposed = true;
                },
              });
            };

          await using sharedResourceByKey = await run.orThrow(
            createSharedResourceByKey(createKeyedResource, {
              idleDisposeAfter: "10ms",
            }),
          );

          const first = await run.orThrow(sharedResourceByKey.acquire("a"));
          await run.orThrow(sharedResourceByKey.release("a"));

          time.advance("10ms");
          await firstDisposeStarted.promise;

          const reacquire = run(sharedResourceByKey.acquire("a"));

          firstDisposeCanFinish.resolve();

          const second = await run.orThrow(() => reacquire);

          expect(second).not.toBe(first);
          expect(second.id).toBe("a-2");
          expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(1);

          const third = await run.orThrow(sharedResourceByKey.acquire("a"));

          expect(third).toBe(second);
          expect(createCallCount).toBe(2);
          expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(2);

          await run.orThrow(sharedResourceByKey.release("a"));
          expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(1);

          await run.orThrow(sharedResourceByKey.release("a"));
          expect(await run.orThrow(sharedResourceByKey.getCount("a"))).toBe(0);
        });
      });

      test("dispose aborts later operations", async () => {
        await using run = testCreateRun();

        const createStarted = Promise.withResolvers<void>();
        const createCanFinish = Promise.withResolvers<void>();
        await using resource = await run.orThrow(createResource("a"));
        const createKeyedResource = (): Task<TestResource> => (run) =>
          new Promise<Result<TestResource, AbortError>>((resolve) => {
            createStarted.resolve();
            run.onAbort((reason) => {
              resolve(err({ type: "AbortError", reason }));
            });

            void createCanFinish.promise.then(() => {
              resolve(ok(resource));
            });
          });
        const sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey(createKeyedResource),
        );

        const acquireFiber = run(sharedResourceByKey.acquire("a"));

        await createStarted.promise;
        const disposePromise = sharedResourceByKey[Symbol.asyncDispose]();
        createCanFinish.resolve();

        await expectRunStopped(acquireFiber);
        await disposePromise;

        await expectRunStopped(run(sharedResourceByKey.acquire("a")));
        await expectRunStopped(run(sharedResourceByKey.release("a")));
        await expectRunStopped(run(sharedResourceByKey.getCount("a")));
      });

      test("root Run disposal aborts later operations until the keyed resource is disposed", async () => {
        const run = testCreateRun();

        const sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey((key: string) => createResource(key)),
        );
        const resource = await run.orThrow(sharedResourceByKey.acquire("a"));

        await run[Symbol.asyncDispose]();

        expect(resource.isDisposed()).toBe(false);

        await using checkRun = testCreateRun();
        await expectRunStopped(checkRun(sharedResourceByKey.acquire("a")));
        await expectRunStopped(checkRun(sharedResourceByKey.release("a")));
        await expectRunStopped(checkRun(sharedResourceByKey.getCount("a")));

        await sharedResourceByKey[Symbol.asyncDispose]();
        expect(resource.isDisposed()).toBe(true);
      });

      test("release throws on over-release", async () => {
        await using run = testCreateRun();

        await using sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey((key: string) => createResource(key)),
        );

        await expect(run(sharedResourceByKey.release("a"))).rejects.toThrow(
          "Release must not be called more times than acquire.",
        );
      });

      test("dispose still aborts later operations when current disposal throws", async () => {
        await using run = testCreateRun();

        const disposeError = new Error("dispose failed");
        const sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey(() =>
            createThrowingResource(disposeKind, disposeError),
          ),
        );

        await run.orThrow(sharedResourceByKey.acquire("a"));

        await expect(sharedResourceByKey[Symbol.asyncDispose]()).rejects.toBe(
          disposeError,
        );

        await expectRunStopped(run(sharedResourceByKey.acquire("a")));
      });

      test("dispose still attempts later keyed disposals when one throws", async () => {
        await using run = testCreateRun();

        const disposeError = new Error("dispose failed");
        let secondDisposed = false;
        const sharedResourceByKey = await run.orThrow(
          createSharedResourceByKey((key: string): Task<TestResource> => {
            if (key === "a") {
              return createThrowingResource(disposeKind, disposeError);
            }

            return () =>
              ok({
                id: key,
                isDisposed: () => secondDisposed,
                ...(disposeKind === "sync"
                  ? {
                      [Symbol.dispose]: () => {
                        secondDisposed = true;
                      },
                    }
                  : {
                      [Symbol.asyncDispose]: async () => {
                        await testWaitForMacrotask();
                        secondDisposed = true;
                      },
                    }),
              });
          }),
        );

        await run.orThrow(sharedResourceByKey.acquire("a"));
        await run.orThrow(sharedResourceByKey.acquire("b"));

        await expect(sharedResourceByKey[Symbol.asyncDispose]()).rejects.toBe(
          disposeError,
        );
        expect(secondDisposed).toBe(true);
      });
    });
  }
});

describe("createSharedResourceByKeyWithClaims", () => {
  test("types require non-failing keyed create Tasks", () => {
    expectTypeOf<typeof createSharedResourceByKeyWithClaims>().toBeFunction();

    expectTypeOf<
      SharedResourceByKeyWithClaims<"key", "claim", TestResource>["addClaim"]
    >().toEqualTypeOf<
      (claim: "claim", resourceKeys: ReadonlyArray<"key">) => Task<void>
    >();

    expectTypeOf<
      SharedResourceByKeyWithClaims<"key", "claim", TestResource>["removeClaim"]
    >().toEqualTypeOf<
      (claim: "claim", resourceKeys: ReadonlyArray<"key">) => Task<void>
    >();

    expectTypeOf<
      SharedResourceByKeyWithClaims<"key", "claim", TestResource>["getResource"]
    >().toEqualTypeOf<
      (
        key: "key",
      ) =>
        | Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
        | undefined
    >();

    expectTypeOf<
      SharedResourceByKeyWithClaims<
        "key",
        "claim",
        TestResource
      >["getClaimsForResource"]
    >().toEqualTypeOf<(key: "key") => ReadonlySet<"claim">>();

    expectTypeOf<
      SharedResourceByKeyWithClaims<
        "key",
        "claim",
        TestResource
      >["getResourceKeysForClaim"]
    >().toEqualTypeOf<(claim: "claim") => ReadonlySet<"key">>();

    expectTypeOf<
      SharedResourceByKeyWithClaims<
        "key",
        "claim",
        TestResource
      >["getResourcesForClaim"]
    >().toEqualTypeOf<
      (
        claim: "claim",
      ) => ReadonlySet<
        Omit<TestResource, typeof Symbol.dispose | typeof Symbol.asyncDispose>
      >
    >();
  });

  test("types accept interface-shaped keys and claims", () => {
    interface Transport {
      readonly type: "WebSocket";
      readonly url: string;
    }

    interface Claim {
      readonly ownerId: string;
    }

    const addClaim: SharedResourceByKeyWithClaims<
      Transport,
      Claim,
      TestResource
    >["addClaim"] = (_claim, _resourceKeys) => () => ok();

    expect(addClaim).toBeTypeOf("function");
  });

  test("repeated structural retain across calls increments pair ref count without duplicating relations", async () => {
    await using run = testCreateRun();

    const firstClaimAdded: Array<string> = [];
    const lastClaimRemoved: Array<string> = [];
    const createCalls: Array<string> = [];

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: { readonly transport: string }) => {
          createCalls.push(key.transport);
          return testCreateResource("sync")(key.transport);
        },
        {
          resourceLookup: transportLookup,
          claimLookup: ownerClaimLookup,
          onFirstClaimAdded: (claim, resource, key) => {
            firstClaimAdded.push(
              `${resource.id}:${key.transport}:${claim.ownerId}`,
            );
          },
          onLastClaimRemoved: (claim, resource, key) => {
            lastClaimRemoved.push(
              `${resource.id}:${key.transport}:${claim.ownerId}`,
            );
          },
        },
      ),
    );

    await run.orThrow(
      sharedResourceByKeyWithClaims.addClaim({ ownerId: "owner-1" }, [
        { transport: "ws://one" },
      ]),
    );
    await run.orThrow(
      sharedResourceByKeyWithClaims.addClaim({ ownerId: "owner-1" }, [
        { transport: "ws://one" },
      ]),
    );

    const resource = sharedResourceByKeyWithClaims.getResource({
      transport: "ws://one",
    });

    expect(resource?.id).toBe("ws://one");
    expect(createCalls).toEqual(["ws://one"]);
    expect(firstClaimAdded).toEqual(["ws://one:ws://one:owner-1"]);
    expect(lastClaimRemoved).toEqual([]);
    expect(
      sharedResourceByKeyWithClaims.getClaimsForResource({
        transport: "ws://one",
      }),
    ).toEqual(new Set([{ ownerId: "owner-1" }]));
    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim({
        ownerId: "owner-1",
      }),
    ).toEqual(new Set([{ transport: "ws://one" }]));
    expect(
      sharedResourceByKeyWithClaims.getResourcesForClaim({
        ownerId: "owner-1",
      }),
    ).toEqual(new Set([resource]));

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim({ ownerId: "owner-1" }, [
        { transport: "ws://one" },
      ]),
    );

    expect(resource?.isDisposed()).toBe(false);
    expect(
      sharedResourceByKeyWithClaims.getClaimsForResource({
        transport: "ws://one",
      }),
    ).toEqual(new Set([{ ownerId: "owner-1" }]));

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim({ ownerId: "owner-1" }, [
        { transport: "ws://one" },
      ]),
    );

    expect(resource?.isDisposed()).toBe(true);
    expect(lastClaimRemoved).toEqual(["ws://one:ws://one:owner-1"]);
    expect(
      sharedResourceByKeyWithClaims.getResource({ transport: "ws://one" }),
    ).toBeUndefined();
    expect(
      sharedResourceByKeyWithClaims.getClaimsForResource({
        transport: "ws://one",
      }),
    ).toEqual(new Set());
    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim({
        ownerId: "owner-1",
      }),
    ).toEqual(new Set());
    expect(
      sharedResourceByKeyWithClaims.getResourcesForClaim({
        ownerId: "owner-1",
      }),
    ).toEqual(new Set());
  });

  test("multiple structural claims share one key until the last claim is removed", async () => {
    await using run = testCreateRun();

    const firstClaimAdded: Array<string> = [];
    const lastClaimRemoved: Array<string> = [];

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: { readonly transport: string }) =>
          testCreateResource("sync")(key.transport),
        {
          resourceLookup: transportLookup,
          claimLookup: ownerClaimLookup,
          onFirstClaimAdded: (claim, _resource, key) => {
            firstClaimAdded.push(`${key.transport}:${claim.ownerId}`);
          },
          onLastClaimRemoved: (claim, _resource, key) => {
            lastClaimRemoved.push(`${key.transport}:${claim.ownerId}`);
          },
        },
      ),
    );

    await run.orThrow(
      sharedResourceByKeyWithClaims.addClaim({ ownerId: "owner-1" }, [
        { transport: "ws://shared" },
      ]),
    );
    await run.orThrow(
      sharedResourceByKeyWithClaims.addClaim({ ownerId: "owner-2" }, [
        { transport: "ws://shared" },
      ]),
    );

    const resource = sharedResourceByKeyWithClaims.getResource({
      transport: "ws://shared",
    });

    expect(firstClaimAdded).toEqual(["ws://shared:owner-1"]);
    expect(
      sharedResourceByKeyWithClaims.getClaimsForResource({
        transport: "ws://shared",
      }),
    ).toEqual(new Set([{ ownerId: "owner-1" }, { ownerId: "owner-2" }]));

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim({ ownerId: "owner-1" }, [
        { transport: "ws://shared" },
      ]),
    );

    expect(resource?.isDisposed()).toBe(false);
    expect(lastClaimRemoved).toEqual([]);
    expect(
      sharedResourceByKeyWithClaims.getClaimsForResource({
        transport: "ws://shared",
      }),
    ).toEqual(new Set([{ ownerId: "owner-2" }]));

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim({ ownerId: "owner-2" }, [
        { transport: "ws://shared" },
      ]),
    );

    expect(resource?.isDisposed()).toBe(true);
    expect(lastClaimRemoved).toEqual(["ws://shared:owner-2"]);
  });

  test("addClaim throws on duplicate structural resource keys in one call", async () => {
    await using run = testCreateRun();

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: { readonly transport: string }) =>
          testCreateResource("sync")(key.transport),
        { resourceLookup: transportLookup },
      ),
    );

    await expect(
      run(
        sharedResourceByKeyWithClaims.addClaim("owner-1", [
          { transport: "ws://one" },
          { transport: "ws://one" },
        ]),
      ),
    ).rejects.toThrow("resourceKeys must not contain lookup duplicates.");
  });

  test("idleDisposeAfter keeps the current resource observable until sync disposal completes", async () => {
    const time = testCreateTime();
    await using run = testCreateRun({ time });

    const disposed = Promise.withResolvers<void>();
    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: string) =>
          testCreateResource("sync")(key, {
            onDispose: () => {
              disposed.resolve();
            },
          }),
        {
          idleDisposeAfter: "10ms",
        },
      ),
    );

    await run.orThrow(sharedResourceByKeyWithClaims.addClaim("owner-1", ["a"]));
    const resource = sharedResourceByKeyWithClaims.getResource("a");

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim("owner-1", ["a"]),
    );

    expect(sharedResourceByKeyWithClaims.getClaimsForResource("a")).toEqual(
      new Set(),
    );
    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim("owner-1"),
    ).toEqual(new Set());
    expect(
      sharedResourceByKeyWithClaims.getResourcesForClaim("owner-1"),
    ).toEqual(new Set());
    expect(sharedResourceByKeyWithClaims.getResource("a")).toBe(resource);

    time.advance("10ms");
    await disposed.promise;
    await testWaitForMacrotask();

    expect(sharedResourceByKeyWithClaims.getResource("a")).toBeUndefined();
  });

  test("idleDisposeAfter stops exposing the resource once async disposal starts", async () => {
    const time = testCreateTime();
    await using run = testCreateRun({ time });

    const disposeStarted = Promise.withResolvers<void>();
    const disposeFinished = Promise.withResolvers<void>();
    const disposeCanFinish = Promise.withResolvers<void>();

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: string): Task<TestResource> => {
          let disposed = false;

          return () =>
            ok({
              id: key,
              isDisposed: () => disposed,
              [Symbol.asyncDispose]: async () => {
                disposeStarted.resolve();
                await disposeCanFinish.promise;
                disposed = true;
                disposeFinished.resolve();
              },
            });
        },
        {
          idleDisposeAfter: "10ms",
        },
      ),
    );

    await run.orThrow(sharedResourceByKeyWithClaims.addClaim("owner-1", ["a"]));
    const resource = sharedResourceByKeyWithClaims.getResource("a");

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim("owner-1", ["a"]),
    );

    expect(sharedResourceByKeyWithClaims.getResource("a")).toBe(resource);

    time.advance("10ms");
    await disposeStarted.promise;

    expect(resource?.isDisposed()).toBe(false);
    expect(sharedResourceByKeyWithClaims.getResource("a")).toBeUndefined();

    disposeCanFinish.resolve();
    await disposeFinished.promise;
    await testWaitForMacrotask();

    expect(resource?.isDisposed()).toBe(true);
    expect(sharedResourceByKeyWithClaims.getResource("a")).toBeUndefined();
    disposeCanFinish.resolve();
  });

  test("removing one of multiple keys keeps structural claim matching intact", async () => {
    await using run = testCreateRun();

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: string) => testCreateResource("sync")(key),
        { claimLookup: encryptedOwnerClaimLookup },
      ),
    );

    const firstClaim = { ownerId: "owner-1", encryptionKey: "enc-1" };
    const equivalentClaim = { encryptionKey: "enc-1", ownerId: "owner-1" };

    await run.orThrow(
      sharedResourceByKeyWithClaims.addClaim(firstClaim, ["a", "b"]),
    );

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim(equivalentClaim, ["a"]),
    );

    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim(equivalentClaim),
    ).toEqual(new Set(["b"]));
    expect(sharedResourceByKeyWithClaims.getClaimsForResource("b")).toEqual(
      new Set([firstClaim]),
    );

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim(equivalentClaim, ["b"]),
    );

    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim(firstClaim),
    ).toEqual(new Set());
  });

  test("stale disposal callback does not hide a reacquired resource", async () => {
    const time = testCreateTime();
    await using run = testCreateRun({ time });

    let createCallCount = 0;
    const firstDisposeStarted = Promise.withResolvers<void>();
    const firstDisposeCanFinish = Promise.withResolvers<void>();

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: string): Task<TestResource> =>
          () => {
            createCallCount += 1;

            let disposed = false;
            const resourceId = `${key}-${createCallCount}`;
            const isFirstResource = createCallCount === 1;

            return ok({
              id: resourceId,
              isDisposed: () => disposed,
              [Symbol.asyncDispose]: async () => {
                if (isFirstResource) {
                  firstDisposeStarted.resolve();
                  await firstDisposeCanFinish.promise;
                }
                disposed = true;
              },
            });
          },
        {
          idleDisposeAfter: "10ms",
        },
      ),
    );

    await run.orThrow(sharedResourceByKeyWithClaims.addClaim("owner-1", ["a"]));
    const first = sharedResourceByKeyWithClaims.getResource("a");

    await run.orThrow(
      sharedResourceByKeyWithClaims.removeClaim("owner-1", ["a"]),
    );

    time.advance("10ms");
    await firstDisposeStarted.promise;

    const reacquire = run(
      sharedResourceByKeyWithClaims.addClaim("owner-2", ["a"]),
    );

    firstDisposeCanFinish.resolve();
    await run.orThrow(() => reacquire);
    await testWaitForMacrotask();

    const second = sharedResourceByKeyWithClaims.getResource("a");

    expect(first?.id).toBe("a-1");
    expect(second?.id).toBe("a-2");
    expect(second).not.toBe(first);
    expect(sharedResourceByKeyWithClaims.getClaimsForResource("a")).toEqual(
      new Set(["owner-2"]),
    );
    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim("owner-2"),
    ).toEqual(new Set(["a"]));
    expect(createCallCount).toBe(2);
  });

  test("removeClaim throws on duplicate structural resource keys in one call", async () => {
    await using run = testCreateRun();

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims(
        (key: { readonly transport: string }) =>
          testCreateResource("sync")(key.transport),
        { resourceLookup: transportLookup },
      ),
    );

    await run.orThrow(
      sharedResourceByKeyWithClaims.addClaim("owner-1", [
        { transport: "ws://one" },
      ]),
    );

    await expect(
      run(
        sharedResourceByKeyWithClaims.removeClaim("owner-1", [
          { transport: "ws://one" },
          { transport: "ws://one" },
        ]),
      ),
    ).rejects.toThrow("resourceKeys must not contain lookup duplicates.");
  });

  test("removeClaim throws on over-removal", async () => {
    await using run = testCreateRun();

    await using sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims((key: string) =>
        testCreateResource("sync")(key),
      ),
    );

    await expect(
      run(sharedResourceByKeyWithClaims.removeClaim("owner-1", ["a"])),
    ).rejects.toThrow(
      "Claim-resource pair must not be removed more times than added.",
    );
  });

  test("dispose aborts claim operations before resource cleanup finishes", async () => {
    await using run = testCreateRun();

    const disposeStarted = Promise.withResolvers<void>();
    const disposeCanFinish = Promise.withResolvers<void>();

    const sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims((key: string): Task<TestResource> => {
        let disposed = false;

        return () =>
          ok({
            id: key,
            isDisposed: () => disposed,
            [Symbol.asyncDispose]: async () => {
              disposeStarted.resolve();
              await disposeCanFinish.promise;
              disposed = true;
            },
          });
      }),
    );

    await run.orThrow(sharedResourceByKeyWithClaims.addClaim("owner-1", ["a"]));

    const disposePromise = sharedResourceByKeyWithClaims[Symbol.asyncDispose]();
    await disposeStarted.promise;

    await expectRunStopped(
      run(sharedResourceByKeyWithClaims.addClaim("owner-2", ["b"])),
    );
    await expectRunStopped(
      run(sharedResourceByKeyWithClaims.removeClaim("owner-1", ["a"])),
    );

    disposeCanFinish.resolve();
    await disposePromise;
  });

  test("dispose aborts later operations", async () => {
    await using run = testCreateRun();

    const sharedResourceByKeyWithClaims = await run.orThrow(
      createSharedResourceByKeyWithClaims((key: string) =>
        testCreateResource("sync")(key),
      ),
    );

    await run.orThrow(sharedResourceByKeyWithClaims.addClaim("owner-1", ["a"]));
    const resource = sharedResourceByKeyWithClaims.getResource("a");

    await sharedResourceByKeyWithClaims[Symbol.asyncDispose]();

    expect(resource?.isDisposed()).toBe(true);
    expect(sharedResourceByKeyWithClaims.getResource("a")).toBeUndefined();
    expect(sharedResourceByKeyWithClaims.getClaimsForResource("a")).toEqual(
      new Set(),
    );
    expect(
      sharedResourceByKeyWithClaims.getResourceKeysForClaim("owner-1"),
    ).toEqual(new Set());
    expect(
      sharedResourceByKeyWithClaims.getResourcesForClaim("owner-1"),
    ).toEqual(new Set());

    await expectRunStopped(
      run(sharedResourceByKeyWithClaims.addClaim("owner-1", ["a"])),
    );
    await expectRunStopped(
      run(sharedResourceByKeyWithClaims.removeClaim("owner-1", ["a"])),
    );
  });
});
