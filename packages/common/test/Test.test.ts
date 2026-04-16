import { describe, expect, expectTypeOf, test } from "vitest";
import type { Brand } from "../src/Brand.js";
import { createCallbacks } from "../src/Callbacks.js";
import { ok } from "../src/Result.js";
import { sleep, type Task } from "../src/Task.js";
import {
  testCreateDeps,
  testCreateId,
  testCreateRun,
  testWaitForMacrotask,
} from "../src/Test.js";
import type { Id } from "../src/Type.js";

interface Foo extends AsyncDisposable {
  readonly value: string;
  readonly isDisposed: () => boolean;
}

const createFoo = (): Task<Foo> => {
  let disposed = false;

  return () =>
    ok({
      value: "foo",
      isDisposed: () => disposed,
      [Symbol.asyncDispose]: () => {
        disposed = true;
        return Promise.resolve();
      },
    });
};

describe("testCreateDeps", () => {
  test("creates fresh deterministic baseline deps", () => {
    const first = testCreateDeps();
    const second = testCreateDeps();

    expect(first).not.toBe(second);
    expect(first.console).not.toBe(second.console);
    expect(first.random.next()).toBe(second.random.next());
    expect(first.randomLib.int(0, 1000)).toBe(second.randomLib.int(0, 1000));
    expect(Array.from(first.randomBytes.create(8))).toEqual(
      Array.from(second.randomBytes.create(8)),
    );

    expect(first.time.now()).toBe(0);
    first.time.advance("1s");
    expect(first.time.now()).toBe(1000);
    expect(second.time.now()).toBe(0);
  });

  test("uses custom seed when provided", () => {
    const first = testCreateDeps({ seed: "custom-seed" });
    const second = testCreateDeps({ seed: "custom-seed" });

    expect(first.random.next()).toBe(second.random.next());
    expect(first.randomLib.int(0, 1000)).toBe(second.randomLib.int(0, 1000));
    expect(Array.from(first.randomBytes.create(8))).toEqual(
      Array.from(second.randomBytes.create(8)),
    );
  });

  test("works as a direct deps bag for synchronous test helpers", () => {
    const deps = testCreateDeps();
    const callbacks = createCallbacks(deps);

    let called = false;
    const id = callbacks.register(() => {
      called = true;
    });

    callbacks.execute(id);

    expect(called).toBe(true);
  });
});

describe("testCreateRun", () => {
  test("provides built-in TestTime", async () => {
    await using run = testCreateRun();

    const fiber = run(sleep("1s"));
    run.deps.time.advance("1s");

    expect(await fiber).toEqual(ok());
  });

  test("supports adding a run-created dependency for a single test", async () => {
    let foo: Foo;

    {
      await using run = testCreateRun();
      await using createdFoo = await run.orThrow(createFoo());
      foo = createdFoo;

      const runWithFoo = run.addDeps({ foo: createdFoo });

      expect(runWithFoo.deps.foo).toBe(createdFoo);
      expect(runWithFoo.deps.foo.value).toBe("foo");
      expect(runWithFoo.deps.foo.isDisposed()).toBe(false);
    }

    expect(foo.isDisposed()).toBe(true);
  });

  test("supports reusable setup helpers centered on a fixture", async () => {
    const setupFoo = async () => {
      await using disposer = new AsyncDisposableStack();
      const run = disposer.use(testCreateRun());
      const foo = disposer.use(await run.orThrow(createFoo()));
      const disposables = disposer.move();

      return {
        run: run.addDeps({ foo }),
        foo,
        [Symbol.asyncDispose]: () => disposables.disposeAsync(),
      };
    };

    let foo: Foo;

    {
      await using setup = await setupFoo();
      const { run, foo: setupFooValue } = setup;
      foo = setupFooValue;

      expect(run.deps.foo).toBe(setupFooValue);
      expect(run.deps.foo.value).toBe("foo");
      expect(setupFooValue.isDisposed()).toBe(false);
      expect(run.getState().type).toBe("Running");
    }

    expect(foo.isDisposed()).toBe(true);
  });
});

describe("testWaitForMacrotask", () => {
  test("waits until a later macrotask by default", async () => {
    let resolved = false;
    const promise = testWaitForMacrotask();
    void promise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    await promise;
    expect(resolved).toBe(true);
  });

  test("accepts an explicit duration", async () => {
    await expect(testWaitForMacrotask("1ms")).resolves.toBeUndefined();
  });
});

describe("testCreateId", () => {
  test("creates file-local stable pseudo-random ids", () => {
    const createTestId = testCreateId();
    const first = createTestId();
    const second = createTestId();

    expect([first, second]).toMatchInlineSnapshot(`
      [
        "IGNl5t4ulaaQpdnwDhgoCA",
        "0l2pVhO0LWfZ0SWcHuPJiQ",
      ]
    `);
    expect(second).not.toBe(first);
    expectTypeOf(first).toEqualTypeOf<Id>();
  });

  test("preserves branded id typing", () => {
    const createTestId = testCreateId();
    const _todoId = createTestId<"Todo">();

    expectTypeOf(_todoId).toEqualTypeOf<Id & Brand<"Todo">>();
  });
});
