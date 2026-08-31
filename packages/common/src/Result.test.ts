import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertRejectsSame,
  assertSame,
  assertThrowsInstanceOf,
  assertThrowsSame,
  assertTrue,
} from "./Assert.ts";

import type { NonEmptyReadonlyArray } from "./Array.ts";
import type {
  Done,
  Err,
  ExcludeDone,
  InferDone,
  InferErr,
  InferOk,
  NextResult,
  OnlyDone,
  Result,
} from "./Result.ts";
import {
  allResult,
  anyResult,
  done,
  err,
  flatMapResult,
  getOk,
  getOrNull,
  getOrThrow,
  isErr,
  isOk,
  ok,
  tryAsync,
  trySync,
} from "./Result.ts";
import { parseStackTrace } from "./StackTrace.ts";
import { assertType } from "./Type.ts";

describe("InferOk and InferErr", () => {
  it("infers Ok type", () => {
    type MyResult = Result<string, { type: "MyError"; code: number }>;
    assertType<InferOk<MyResult>, string>();
  });

  it("infers Err type", () => {
    interface MyError {
      readonly type: "MyError";
      readonly code: number;
    }
    type MyResult = Result<string, MyError>;
    assertType<InferErr<MyResult>, MyError>();
  });

  it("handles void Result", () => {
    type VoidResult = Result<void, Error>;
    assertType<InferOk<VoidResult>, void>();
    assertType<InferErr<VoidResult>, Error>();
  });

  it("works at runtime", () => {
    interface MyError {
      readonly type: "MyError";
      readonly code: number;
    }
    type MyResult = Result<string, MyError>;

    const okValue: InferOk<MyResult> = "hello";
    const errValue: InferErr<MyResult> = { type: "MyError", code: 404 };

    assertEqual(okValue, "hello");
    assertEqual(errValue, { type: "MyError", code: 404 });
  });
});

describe("ok", () => {
  it("creates Ok with a value", () => {
    assertEqual(ok(42), { ok: true, value: 42 });
  });

  it("creates Ok<void> without arguments", () => {
    assertEqual(ok(), { ok: true, value: undefined });
  });

  it("caches ok() and ok(undefined)", () => {
    assertSame(ok(), ok());
    assertSame(ok(undefined), ok());
  });

  it("rejects Ok<void> when Result expects a value", () => {
    // @ts-expect-error Type 'Ok<void>' is not assignable to type 'Result<string, Error>'
    const _result: Result<string, Error> = ok();
  });

  it("returns Result<T, never> for correct type inference", () => {
    const result = ok(42);
    assertType<typeof result, Result<number>>();
  });

  it("infers never for E when combining with err", () => {
    interface MyError {
      readonly type: "MyError";
    }

    const example = (fail: boolean): Result<number, MyError> => {
      if (fail) return err({ type: "MyError" });
      return ok(42);
    };

    {
      const actual = example(false);
      assertType<typeof actual, Result<number, MyError>>();
    }
  });
});

describe("err", () => {
  it("creates Err with an error", () => {
    assertEqual(err("error"), { ok: false, error: "error" });
  });

  it("returns Result<never, E> for correct type inference", () => {
    const result = err("oops");
    assertType<typeof result, Result<never, string>>();
  });
});

describe("isOk and isErr", () => {
  it("identifies Ok result", () => {
    const result = ok(123);

    assertTrue(isOk(result));
    assertFalse(isErr(result));
  });

  it("isOk narrows an Ok result", () => {
    const result = ok(123);

    if (isOk(result)) {
      assertType<typeof result.value, number>();
    }
  });

  it("identifies Err result", () => {
    const result = err({ type: "TestError" as const });

    assertFalse(isOk(result));
    assertTrue(isErr(result));
  });

  it("isErr narrows an Err result", () => {
    const result = err({ type: "TestError" as const });

    if (isErr(result)) {
      assertType<
        typeof result.error extends { readonly type: "TestError" }
          ? true
          : false,
        true
      >();
    }
  });
});

describe("getOrThrow", () => {
  it("returns value for Ok", () => {
    assertEqual(getOrThrow(ok(42)), 42);
  });

  it("throws for Err", () => {
    const error = assertThrowsInstanceOf(() => getOrThrow(err("error")), Error);
    assertTrue(error.message.includes("getOrThrow"));
  });

  it("includes primitive error as cause", () => {
    const error = assertThrowsInstanceOf(() => getOrThrow(err("error")), Error);
    assertEqual(error.cause, "error");
  });

  it("includes Error instance as cause", () => {
    const original = new TypeError("boom");
    const error = assertThrowsInstanceOf(
      () => getOrThrow(err(original)),
      Error,
    );
    assertSame(error.cause, original);
  });
});

describe("getOrNull", () => {
  it("returns value for Ok", () => {
    assertEqual(getOrNull(ok(42)), 42);
  });

  it("returns null for Err", () => {
    assertSame(getOrNull(err("error")), null);
  });
});

describe("getOk", () => {
  it("extracts value from Result with never error", () => {
    const result = ok(42);
    assertEqual(getOk(result), 42);
  });

  it("rejects Result with possible error type", () => {
    type IsAssignable =
      Result<number, string> extends Result<number> ? true : false;
    assertType<IsAssignable, false>();
  });

  it("throws when invariant is violated at runtime", () => {
    const invalid = err("fail") as unknown as Result<number>;
    const error = assertThrowsInstanceOf(() => getOk(invalid), Error);
    assertTrue(error.message.includes("Expected Ok result."));
  });
});

describe("trySync", () => {
  interface ParseError {
    readonly type: "ParseError";
    readonly message: string;
  }

  it("returns Ok on success", () => {
    const result = trySync(
      () => JSON.parse('{"key": "value"}') as unknown,
      (error): ParseError => ({ type: "ParseError", message: String(error) }),
    );

    assertEqual(result, {
      ok: true,
      value: { key: "value" },
    });
  });

  it("returns Err on exception", () => {
    const result = trySync(
      () => JSON.parse("{key: value}") as unknown,
      (error): ParseError => ({ type: "ParseError", message: String(error) }),
    );

    assertErr(result);
    const { message } = result.error;
    assertTrue(message.includes("SyntaxError"));
    assertEqual(result, {
      ok: false,
      error: { type: "ParseError", message },
    });
  });

  it("returns Err with the exception when mapError is omitted", () => {
    const failure = new Error("Something went wrong");
    const result = trySync(() => {
      throw failure;
    });

    assertType<typeof result, Result<never, unknown>>();
    assertEqual(result, err(failure));
  });

  it("mapError may throw to escalate a failure", () => {
    const failure = new Error("Something went wrong");
    const escalated = new Error("Escalated");

    assertThrowsSame(
      () =>
        trySync(
          () => {
            throw failure;
          },
          () => {
            throw escalated;
          },
        ),
      escalated,
    );
  });
});

describe("tryAsync", () => {
  it("returns Ok on resolved promise", async () => {
    const result = await tryAsync(
      () => Promise.resolve(),
      (error) => ({ type: "TestError", message: String(error) }),
    );

    assertEqual(result, ok());
  });

  it("returns Err on rejected promise", async () => {
    const result = await tryAsync(
      // oxlint-disable-next-line typescript/require-await
      async () => {
        throw new Error("Something went wrong");
      },
      (error) => ({ type: "TestError", message: String(error) }),
    );

    assertEqual(
      result,
      err({
        type: "TestError",
        message: "Error: Something went wrong",
      }),
    );
  });

  it("returns Err with the rejection when mapError is omitted", async () => {
    const failure = new Error("Something went wrong");
    const result = await tryAsync(
      // oxlint-disable-next-line typescript/require-await
      async () => {
        throw failure;
      },
    );

    assertType<typeof result, Result<never, unknown>>();
    assertEqual(result, err(failure));
  });

  it("maps custom error properties", async () => {
    const result = await tryAsync(
      // oxlint-disable-next-line typescript/require-await
      async () => {
        throw new TypeError("Invalid type");
      },
      (error) => ({
        type: "CustomError",
        name: error instanceof Error ? error.name : "UnknownError",
        message: String(error),
      }),
    );

    assertEqual(
      result,
      err({
        type: "CustomError",
        name: "TypeError",
        message: "TypeError: Invalid type",
      }),
    );
  });

  it("mapError may throw to escalate a failure", async () => {
    const failure = new Error("Something went wrong");
    const escalated = new Error("Escalated");

    await assertRejectsSame(
      tryAsync(
        () => Promise.reject(failure),
        () => {
          throw escalated;
        },
      ),
      escalated,
    );
  });

  it("catches synchronous throws", async () => {
    const result = await tryAsync(
      () => {
        throw new Error("Sync throw before promise");
      },
      (error) => ({ type: "TestError", message: String(error) }),
    );

    assertEqual(
      result,
      err({
        type: "TestError",
        message: "Error: Sync throw before promise",
      }),
    );
  });

  it("preserves its await boundary in rejected error stacks", async () => {
    const result = await tryAsync(async () => {
      await Promise.resolve();
      throw new Error("Something went wrong");
    });

    assertErr(result);
    assertInstanceOf(result.error, Error);

    assertTrue(parseStackTrace(result.error.stack).files.includes("Result.ts"));
  });
});

describe("NextResult", () => {
  it("models success, failure, and done", () => {
    type E = "E";

    const a: NextResult<number, E, string> = ok(1);
    const b: NextResult<number, E, string> = err(done("finished"));
    const c: NextResult<number, E, string> = err<E>("E");

    assertType<typeof a, NextResult<number, E, string>>();
    assertFalse(b.ok);
    assertFalse(c.ok);
  });

  it("extracts all type parameters", () => {
    type MyNextResult = NextResult<number, string, { summary: string }>;

    assertType<InferOk<MyNextResult>, number>();
    assertType<InferErr<MyNextResult>, string | Done<{ summary: string }>>();
    assertType<
      InferDone<MyNextResult>,
      {
        summary: string;
      }
    >();
  });

  describe("done", () => {
    it("creates Done with done value", () => {
      assertEqual(done("finished"), {
        type: "Done",
        done: "finished",
      });
    });

    it("creates Done<void> without arguments", () => {
      assertEqual(done(), {
        type: "Done",
        done: undefined,
      });
      {
        const actual = done();
        assertType<typeof actual, Done<void>>();
      }
    });

    it("preserves done type", () => {
      const value = done({ count: 1 });
      assertType<typeof value, Done<{ count: number }>>();
      assertType<typeof value.done, { count: number }>();
    });
  });

  describe("ExcludeDone and OnlyDone", () => {
    it("ExcludeDone removes Done from a union", () => {
      interface MyError {
        readonly type: "MyError";
      }
      type E = MyError | Done<void>;
      assertType<ExcludeDone<E>, MyError>();
    });

    it("OnlyDone keeps only Done from a union", () => {
      interface MyError {
        readonly type: "MyError";
      }
      type E = MyError | Done<"done">;
      assertType<OnlyDone<E>, Done<"done">>();
    });

    it("OnlyDone returns never when there is no Done", () => {
      type E = "E";
      assertType<OnlyDone<E>, never>();
    });
  });

  describe("InferDone", () => {
    it("extracts Done type from NextResult with void done", () => {
      type R = NextResult<number, string>;
      assertType<InferDone<R>, void>();
    });

    it("extracts Done type from NextResult with complex done", () => {
      type R = NextResult<
        number,
        string,
        { count: number; items: Array<string> }
      >;
      assertType<
        InferDone<R>,
        {
          count: number;
          items: Array<string>;
        }
      >();
    });

    it("returns never for Result without Done", () => {
      type R = Result<number, string>;
      assertType<InferDone<R>, never>();
    });

    it("works with union errors containing Done", () => {
      interface MyError {
        readonly type: "MyError";
      }
      type R = Result<number, MyError | Done<string>>;
      assertType<InferDone<R>, string>();
    });
  });
});

describe("flatMapResult", () => {
  it("composes an Ok with another Result-returning operation", () => {
    const result = flatMapResult(ok(21), (value) => ok(value * 2));

    assertEqual(result, ok(42));
    assertType<typeof result, Result<number>>();
  });

  it("returns the existing Err without calling the operation", () => {
    interface FirstError {
      readonly type: "FirstError";
    }

    interface SecondError {
      readonly type: "SecondError";
    }

    const first = (): Result<number, FirstError> => err({ type: "FirstError" });
    let called = false;
    const result = flatMapResult(first(), (): Result<string, SecondError> => {
      called = true;
      return err({ type: "SecondError" });
    });

    assertEqual(result, err({ type: "FirstError" }));
    assertFalse(called);
    assertType<
      typeof result extends Result<string, FirstError | SecondError>
        ? true
        : false,
      true
    >();
  });

  it("returns an error from the next operation", () => {
    const result = flatMapResult(ok(42), () => err("fail"));

    assertEqual(result, err("fail"));
  });
});

describe("allResult", () => {
  it("returns emptyArray for empty array", () => {
    const result = allResult([]);
    assertEqual(result, ok([]));
  });

  it("returns emptyRecord for empty record", () => {
    const result = allResult({});
    assertOk(result, {});
  });

  it("extracts all values from array of Ok results", () => {
    const results = [ok(1), ok(2), ok(3)];
    assertEqual(allResult(results), ok([1, 2, 3]));
  });

  it("returns first error from array", () => {
    interface E1 {
      readonly type: "E1";
    }
    interface E2 {
      readonly type: "E2";
    }
    const results: NonEmptyReadonlyArray<Result<number, E1 | E2>> = [
      ok(1),
      err({ type: "E1" }),
      err({ type: "E2" }),
    ];
    assertEqual(allResult(results), err({ type: "E1" }));
  });

  it("extracts all values from struct", () => {
    const result = allResult({ a: ok(1), b: ok("two") });
    assertOk(result, { a: 1, b: "two" });
  });

  it("returns first error from struct", () => {
    const result = allResult({ a: ok(1), b: err("fail"), c: ok(3) });
    assertEqual(result, err("fail"));
  });

  it("tuple preserves types", () => {
    const result = allResult([ok(1), ok("two"), ok(true)]);
    if (result.ok) {
      {
        const actual = result.value[0];
        assertType<typeof actual, number>();
      }
      {
        const actual = result.value[1];
        assertType<typeof actual, string>();
      }
      {
        const actual = result.value[2];
        assertType<typeof actual, boolean>();
      }
    }
  });

  it("struct preserves types", () => {
    const result = allResult({ a: ok(1), b: ok("two") });
    if (result.ok) {
      assertType<typeof result.value, { a: number; b: string }>();
    }
  });

  it("non-empty arrays preserve types", () => {
    const result = allResult([ok(1), ok(2)]);
    if (result.ok) {
      {
        const actual = result.value[0];
        assertType<typeof actual, number>();
      }
      {
        const actual = result.value[1];
        assertType<typeof actual, number>();
      }
    }
  });

  it("works with Iterable", () => {
    const set = new Set([ok(1), ok(2), ok(3)]);
    const result = allResult(set);
    assertEqual(result, ok([1, 2, 3]));
  });

  it("returns an empty array for an empty non-array Iterable", () => {
    const results = new Set<Result<number>>();
    const result = allResult(results);

    assertType<typeof result, Result<ReadonlyArray<number>>>();
    assertEqual(result, ok([]));
  });

  it("stops consuming an Iterable on the first error", () => {
    const consumedValues: Array<number> = [];
    const createResults = function* (): Generator<Result<number, string>> {
      consumedValues.push(1);
      yield ok(1);
      consumedValues.push(2);
      yield err("fail");
      consumedValues.push(3);
      yield ok(3);
    };

    const result = allResult(createResults());

    assertErr(result, "fail");
    assertEqual(consumedValues, [1, 2]);
  });

  it("ignores inherited record properties", () => {
    const results = Object.assign(
      Object.create({ inherited: err("fail") }) as Record<
        string,
        Result<number, string>
      >,
      { own: ok(1) },
    );

    const result = allResult(results);

    assertOk(result, { own: 1 });
  });

  it("does not collect Ok values", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first: Result<number, FirstError> = ok(1);
    const second: Result<string, SecondError> = ok("two");

    const result = allResult([first, second], { collect: false });

    assertType<typeof result, Result<void, FirstError | SecondError>>();
    assertOk(result, undefined);
  });

  it("returns the first Err without collecting Ok values", () => {
    const result = allResult([ok(1), err("first"), err("second")], {
      collect: false,
    });

    assertErr(result, "first");
  });

  it("does not collect Ok values from a record", () => {
    const result = allResult(
      { first: ok(1), second: err("fail") },
      { collect: false },
    );

    assertType<typeof result, Result<void, string>>();
    assertErr(result, "fail");
  });
});

describe("allResult mapping overload", () => {
  it("returns emptyArray for empty array", () => {
    const result = allResult([], (x: number) => ok(x * 2));
    assertEqual(result, ok([]));
  });

  it("returns emptyRecord for empty record", () => {
    const result = allResult({}, (x: number) => ok(x * 2));
    assertOk(result, {});
  });

  it("maps items and collects results", () => {
    const result = allResult([1, 2, 3], (x) => ok(x * 2));
    assertEqual(result, ok([2, 4, 6]));
  });

  it("returns first error", () => {
    const result = allResult([1, 2, 3], (x) =>
      x === 2 ? err("fail") : ok(x * 2),
    );
    assertEqual(result, err("fail"));
  });

  it("does not map values after the first error", () => {
    const mappedValues: Array<number> = [];
    const result = allResult([1, 2, 3], (value) => {
      mappedValues.push(value);
      return value === 2 ? err("fail") : ok(value * 2);
    });

    assertEqual(result, err("fail"));
    assertEqual(mappedValues, [1, 2]);
  });

  it("infers heterogeneous mapper errors", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const first = (): Result<void, FirstError> => ok();
    const second = (): Result<void, SecondError> =>
      err({ type: "SecondError" });
    const result = allResult([first, second], (operation) => operation());

    assertType<
      typeof result,
      Result<readonly [void, void], FirstError | SecondError>
    >();
    assertErr(result, { type: "SecondError" });
  });

  it("does not collect mapped Ok values", () => {
    const result = allResult([1, 2, 3], (value) => ok(value * 2), {
      collect: false,
    });

    assertType<typeof result, Result<void>>();
    assertOk(result, undefined);
  });

  it("stops mapping without collecting on the first Err", () => {
    interface FirstError {
      readonly type: "FirstError";
    }
    interface SecondError {
      readonly type: "SecondError";
    }

    const calls: Array<string> = [];
    const first = (): Result<number, FirstError> => {
      calls.push("first");
      return ok(1);
    };
    const second = (): Result<number, SecondError> => {
      calls.push("second");
      return err({ type: "SecondError" });
    };
    const result = allResult([first, second], (operation) => operation(), {
      collect: false,
    });

    assertType<typeof result, Result<void, FirstError | SecondError>>();
    assertErr(result, { type: "SecondError" });
    assertEqual(calls, ["first", "second"]);
  });

  it("maps struct and collects results", () => {
    const result = allResult({ a: 1, b: 2 }, (x) => ok(x * 2));
    assertOk(result, { a: 2, b: 4 });
  });

  it("maps a record without collecting Ok values", () => {
    const result = allResult({ a: 1, b: 2 }, (x) => ok(x * 2), {
      collect: false,
    });

    assertType<typeof result, Result<void>>();
    assertOk(result, undefined);
  });

  it("returns first error from struct", () => {
    const result = allResult({ a: 1, b: 2, c: 3 }, (x) =>
      x === 2 ? err("fail") : ok(x * 2),
    );
    assertEqual(result, err("fail"));
  });

  it("struct preserves types", () => {
    const result = allResult({ a: 1, b: 2 }, (x) => ok(String(x)));
    if (result.ok) {
      assertType<typeof result.value, Readonly<Record<"a" | "b", string>>>();
    }
  });

  it("non-empty arrays preserve types", () => {
    const result = allResult([1, 2, 3], (x) => ok(x * 2));
    if (result.ok) {
      {
        const actual = result.value[0];
        assertType<typeof actual, number>();
      }
      {
        const actual = result.value[1];
        assertType<typeof actual, number>();
      }
      {
        const actual = result.value[2];
        assertType<typeof actual, number>();
      }
    }
  });

  it("works with Iterable", () => {
    const set = new Set([1, 2, 3]);
    const result = allResult(set, (x) => ok(x * 2));
    assertEqual(result, ok([2, 4, 6]));
  });
});

describe("anyResult", () => {
  it("returns first success", () => {
    assertEqual(anyResult([err("a"), ok(42), err("b")]), ok(42));
  });

  it("returns last error when all fail", () => {
    assertEqual(anyResult([err("a"), err("b"), err("c")]), err("c"));
  });

  it("returns first Ok even if it's first", () => {
    assertEqual(anyResult([ok(1), ok(2), ok(3)]), ok(1));
  });

  it("preserves types", () => {
    const result = anyResult([err({ type: "E1" as const }), ok(42)]);
    if (result.ok) {
      assertType<typeof result.value, number>();
    }
  });
});

test("example: parseJson with early return", () => {
  interface ParseJsonError {
    readonly type: "ParseJsonError";
    readonly message: string;
  }

  const parseJson = (value: string): Result<unknown, ParseJsonError> => {
    try {
      return ok(JSON.parse(value));
    } catch (error) {
      return err({ type: "ParseJsonError", message: String(error) });
    }
  };

  const json = parseJson('{"key": "value"}');

  if (!json.ok) return undefined;

  assertType<typeof json.value, unknown>();
  return undefined;
});

// --- Result with resource management ---
//
// Result and resource management are orthogonal concerns:
// - Result answers: "Did the operation succeed?"
// - Disposable answers: "When do we clean up resources?"
//
// Pattern:
// 1. Call a function that returns Result<Resource, Error>
// 2. If !result.ok, return early → disposal happens automatically
// 3. If result.ok, add result.value to the stack → resource gets tracked

interface CreateResourceError {
  readonly type: "CreateResourceError";
  readonly reason: string;
}

interface Resource extends Disposable {
  readonly id: string;
  readonly isDisposed: () => boolean;
}

interface AsyncResource extends AsyncDisposable {
  readonly id: string;
  readonly isDisposed: () => boolean;
}

const createMockResource = (id: string): Resource => {
  let disposed = false;
  return {
    id,
    isDisposed: () => disposed,
    [Symbol.dispose]: () => {
      disposed = true;
    },
  };
};

const createMockAsyncResource = (id: string): AsyncResource => {
  let disposed = false;
  return {
    id,
    isDisposed: () => disposed,
    [Symbol.asyncDispose]: async () => {
      await Promise.resolve();
      disposed = true;
    },
  };
};

const createResource = (
  id: string,
  shouldFail: boolean,
): Result<Resource, CreateResourceError> => {
  if (shouldFail) {
    return err({
      type: "CreateResourceError",
      reason: `Failed to create ${id}`,
    });
  }
  return ok(createMockResource(id));
};

const createAsyncResource = async (
  id: string,
  shouldFail: boolean,
): Promise<Result<AsyncResource, CreateResourceError>> => {
  await Promise.resolve();
  if (shouldFail) {
    return err({
      type: "CreateResourceError",
      reason: `Failed to create ${id}`,
    });
  }
  return ok(createMockAsyncResource(id));
};

describe("Result with Resource management", () => {
  describe("using keyword", () => {
    it("disposes on success", () => {
      const resource = createResource("db", false);
      if (!resource.ok) throw new Error("Should not fail");

      {
        using _ = resource.value;
        assertFalse(resource.value.isDisposed());
      }

      assertTrue(resource.value.isDisposed());
    });

    it("disposes on early return", () => {
      let resource = null as Resource | null;

      const process = (): Result<string, CreateResourceError> => {
        const result = createResource("db", false);
        if (!result.ok) return result;

        resource = result.value;
        using _ = resource;

        return err({ type: "CreateResourceError", reason: "other failure" });
      };

      const result = process();
      assertErr(result, {
        type: "CreateResourceError",
        reason: "other failure",
      });
      assertTrue(resource?.isDisposed());
    });

    it("disposes on throw", () => {
      let resource = null as Resource | null;

      const process = (): void => {
        const result = createResource("db", false);
        if (!result.ok) throw new Error("Should not fail");

        resource = result.value;
        using _ = resource;

        throw new Error("Unexpected!");
      };

      const error = assertThrowsInstanceOf(() => {
        process();
      }, Error);
      assertTrue(error.message.includes("Unexpected!"));
      assertTrue(resource?.isDisposed());
    });

    // Block scopes control resource lifetime (RAII pattern).
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/using#using_in_a_block
    it("disposes at block scope exit", () => {
      const log: Array<string> = [];

      const createLock = (name: string): Disposable => ({
        [Symbol.dispose]: () => {
          log.push(`unlock:${name}`);
        },
      });

      const process = (): void => {
        log.push("start");

        {
          using _ = createLock("a");
          log.push("critical-section-a");
          // lock "a" released here
        }

        log.push("between");

        {
          using _ = createLock("b");
          log.push("critical-section-b");
          // lock "b" released here
        }

        log.push("end");
      };

      process();
      assertEqual(log, [
        "start",
        "critical-section-a",
        "unlock:a",
        "between",
        "critical-section-b",
        "unlock:b",
        "end",
      ]);
    });
  });

  describe("DisposableStack", () => {
    it("disposes resources on successful completion", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using disposer = new DisposableStack();

        const resource1 = createResource("db", false);
        if (!resource1.ok) return resource1;
        disposer.use(resource1.value);
        disposer.defer(() => {
          disposed.push("db");
        });

        const resource2 = createResource("file", false);
        if (!resource2.ok) return resource2;
        disposer.use(resource2.value);
        disposer.defer(() => {
          disposed.push("file");
        });

        return ok("processed");
      };

      const result = processResources();
      assertOk(result, "processed");
      assertEqual(disposed, ["file", "db"]);
    });

    it("disposes created resources when later creation fails", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using disposer = new DisposableStack();

        const resource1 = createResource("db", false);
        if (!resource1.ok) return resource1;
        disposer.use(resource1.value);
        disposer.defer(() => {
          disposed.push("db");
        });

        const resource2 = createResource("file", true);
        if (!resource2.ok) return resource2;

        disposer.use(resource2.value);
        disposer.defer(() => {
          disposed.push("file");
        });

        return ok("processed");
      };

      const result = processResources();
      assertErr(result, {
        type: "CreateResourceError",
        reason: "Failed to create file",
      });
      assertEqual(disposed, ["db"]);
    });

    it("disposes nothing when first creation fails", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using disposer = new DisposableStack();

        const resource1 = createResource("db", true);
        if (!resource1.ok) return resource1;
        disposer.use(resource1.value);
        disposer.defer(() => {
          disposed.push("db");
        });

        return ok("processed");
      };

      const result = processResources();
      assertErr(result, {
        type: "CreateResourceError",
        reason: "Failed to create db",
      });
      assertEqual(disposed, []);
    });

    it("works with adopt for non-disposable values", () => {
      let connectionClosed = false;

      interface Connection {
        readonly query: (sql: string) => Array<string>;
      }

      const openConnection = (
        shouldFail: boolean,
      ): Result<Connection, CreateResourceError> => {
        if (shouldFail) {
          return err({
            type: "CreateResourceError",
            reason: "Connection failed",
          });
        }
        return ok({
          query: (sql: string) => [`result for: ${sql}`],
        });
      };

      const closeConnection = (_conn: Connection): void => {
        connectionClosed = true;
      };

      const queryDatabase = (): Result<Array<string>, CreateResourceError> => {
        using disposer = new DisposableStack();

        const conn = openConnection(false);
        if (!conn.ok) return conn;

        disposer.adopt(conn.value, closeConnection);

        return ok(conn.value.query("SELECT * FROM users"));
      };

      const result = queryDatabase();
      assertOk(result, ["result for: SELECT * FROM users"]);
      assertTrue(connectionClosed);
    });

    it("handles multiple resources with mixed success/failure", () => {
      const log: Array<string> = [];

      interface ProcessingError {
        readonly type: "ProcessingError";
        readonly step: string;
      }

      type MyError = CreateResourceError | ProcessingError;

      const process = (): Result<void, MyError> => {
        using disposer = new DisposableStack();

        const db = createResource("db", false);
        if (!db.ok) return db;
        disposer.use(db.value);
        disposer.defer(() => {
          log.push("cleanup:db");
        });

        const cache = createResource("cache", false);
        if (!cache.ok) return cache;
        disposer.use(cache.value);
        disposer.defer(() => {
          log.push("cleanup:cache");
        });

        log.push("work:step1");

        const step2Result = err({
          type: "ProcessingError",
          step: "step2",
        }) as Result<void, ProcessingError>;
        if (!step2Result.ok) return step2Result;

        log.push("work:step2");
        return ok();
      };

      const result = process();
      assertErr(result, { type: "ProcessingError", step: "step2" });
      assertEqual(log, ["work:step1", "cleanup:cache", "cleanup:db"]);
    });

    it("disposes resources even when unexpected error is thrown", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using disposer = new DisposableStack();

        const resource1 = createResource("db", false);
        if (!resource1.ok) return resource1;
        disposer.use(resource1.value);
        disposer.defer(() => {
          disposed.push("db");
        });

        // Simulate unexpected error (bug in code, not a Result error)
        throw new Error("Unexpected bug!");

        // This code is unreachable but shows the pattern
        // return ok("processed");
      };

      // The unexpected error propagates, but disposal still happens
      const error = assertThrowsInstanceOf(() => processResources(), Error);
      assertTrue(error.message.includes("Unexpected bug!"));
      assertEqual(disposed, ["db"]);
    });

    it("transfers ownership with move()", () => {
      const disposed: Array<string> = [];

      const createResources = (): Result<
        DisposableStack,
        CreateResourceError
      > => {
        using disposer = new DisposableStack();

        const r1 = createResource("a", false);
        if (!r1.ok) return r1;
        disposer.use(r1.value);
        disposer.defer(() => {
          disposed.push("a");
        });

        const r2 = createResource("b", false);
        if (!r2.ok) return r2;
        disposer.use(r2.value);
        disposer.defer(() => {
          disposed.push("b");
        });

        return ok(disposer.move());
      };

      interface TransferError {
        readonly type: "TransferError";
      }

      const useResources = (): Result<
        void,
        CreateResourceError | TransferError
      > => {
        const resources = createResources();
        if (!resources.ok) return resources;

        using _ = resources.value;

        disposed.push("work");

        return ok();
      };

      const result = useResources();
      assertOk(result, undefined);
      assertEqual(disposed, ["work", "b", "a"]);
    });
  });

  describe("AsyncDisposableStack", () => {
    it("disposes async resources on successful completion", async () => {
      const disposed: Array<string> = [];

      const processResources = async (): Promise<
        Result<string, CreateResourceError>
      > => {
        await using disposer = new AsyncDisposableStack();

        const resource1 = await createAsyncResource("db", false);
        if (!resource1.ok) return resource1;
        disposer.use(resource1.value);
        disposer.defer(async () => {
          await Promise.resolve();
          disposed.push("db");
        });

        const resource2 = await createAsyncResource("file", false);
        if (!resource2.ok) return resource2;
        disposer.use(resource2.value);
        disposer.defer(async () => {
          await Promise.resolve();
          disposed.push("file");
        });

        return ok("processed");
      };

      const result = await processResources();
      assertOk(result, "processed");
      assertEqual(disposed, ["file", "db"]);
    });

    it("disposes created async resources when later creation fails", async () => {
      const disposed: Array<string> = [];

      const processResources = async (): Promise<
        Result<string, CreateResourceError>
      > => {
        await using disposer = new AsyncDisposableStack();

        const resource1 = await createAsyncResource("db", false);
        if (!resource1.ok) return resource1;
        disposer.use(resource1.value);
        disposer.defer(async () => {
          await Promise.resolve();
          disposed.push("db");
        });

        const resource2 = await createAsyncResource("file", true);
        if (!resource2.ok) return resource2;
        disposer.use(resource2.value);
        disposer.defer(async () => {
          await Promise.resolve();
          disposed.push("file");
        });

        return ok("processed");
      };

      const result = await processResources();
      assertErr(result, {
        type: "CreateResourceError",
        reason: "Failed to create file",
      });
      assertEqual(disposed, ["db"]);
    });

    it("can mix sync and async resources", async () => {
      const disposed: Array<string> = [];

      const processResources = async (): Promise<
        Result<string, CreateResourceError>
      > => {
        await using disposer = new AsyncDisposableStack();

        const syncResource = createResource("sync", false);
        if (!syncResource.ok) return syncResource;
        disposer.use(syncResource.value);
        disposer.defer(() => {
          disposed.push("sync");
        });

        const asyncResource = await createAsyncResource("async", false);
        if (!asyncResource.ok) return asyncResource;
        disposer.use(asyncResource.value);
        disposer.defer(async () => {
          await Promise.resolve();
          disposed.push("async");
        });

        return ok("mixed");
      };

      const result = await processResources();
      assertOk(result, "mixed");
      assertEqual(disposed, ["async", "sync"]);
    });
  });
});

/**
 * Evolu uses plain Result objects and explicit checks instead of
 * generator-based composition.
 *
 * Generators make sequential workflows more concise because `yield*` combines
 * error propagation with unwrapping the success value. That concision adds
 * generator machinery and makes control flow less explicit. With AI coding
 * tools, writing `if (!result.ok) return result` is cheap, so saving those
 * lines is less important.
 *
 * Generators also do not prevent accidental omission. A lazy operation called
 * without `yield*` is left out of the workflow, just as a Result can be
 * ignored. Dedicated tooling can detect either mistake, while tests remain the
 * runnable specification for successful and failing paths.
 *
 * A historical Apple M1 microbenchmark used 500,000 iterations of a three-step
 * Result chain and produced these rough numbers:
 *
 * - Imperative: ~25 ms
 * - Generator with a wrapper: ~330 ms (~13x slower)
 * - Iterable Result with an inline generator: ~1200 ms (~48x slower)
 * - Iterable Result with a hoisted generator: ~990 ms (~40x slower)
 *
 * This artificial workload does not predict application performance. It only
 * demonstrates that generator composition has measurable runtime overhead in a
 * tight synchronous loop. The skipped test below preserves the experiment.
 */
describe("design decisions", () => {
  describe("generators", () => {
    interface ParseError {
      readonly type: "ParseError";
    }

    interface ValidationError {
      readonly type: "ValidationError";
    }

    /** A generator that yields errors and returns a value on success. */
    type Gen<T, E> = Generator<Err<E>, T>;

    /**
     * Converts a Result to a Gen for use with yield*.
     *
     * @yields {Err<E>} Err if the result is an error
     */
    // oxlint-disable-next-line eslint/func-style -- Generators require the function keyword.
    function* gen<T, E>(result: Result<T, E>): Gen<T, E> {
      if (result.ok) {
        return result.value;
      }
      yield result;
      // This line is never reached - the runner exits on first yielded Err
      throw new Error("Unreachable");
    }

    /** Runs a Gen and returns the Result. */
    const runGen = <T, E>(gen: Gen<T, E>): Result<T, E> => {
      const next = gen.next();
      if (!next.done) {
        // Generator yielded an Err - force cleanup by calling return()
        // This triggers finally blocks and `using` disposal in the generator
        gen.return(undefined as T);
        return next.value;
      }
      return ok(next.value);
    };

    const parse = (input: string): Result<number, ParseError> => {
      const n = parseInt(input, 10);
      return isNaN(n) ? err({ type: "ParseError" }) : ok(n);
    };

    const validate = (n: number): Result<number, ValidationError> =>
      n > 0 ? ok(n) : err({ type: "ValidationError" });

    const double = (n: number): Result<number> => ok(n * 2);

    it("composes multiple Results with generators", () => {
      const program = function* (
        input: string,
      ): Gen<number, ParseError | ValidationError> {
        const parsed = yield* gen(parse(input));
        const validated = yield* gen(validate(parsed));
        const doubled = yield* gen(double(validated));
        return doubled;
      };

      // Success case
      const success = runGen(program("21"));
      assertEqual(success, ok(42));

      // Parse error
      const parseErr = runGen(program("not a number"));
      assertEqual(parseErr, err({ type: "ParseError" }));

      // Validation error
      const validationErr = runGen(program("-5"));
      assertEqual(validationErr, err({ type: "ValidationError" }));
    });

    it("is equivalent to imperative pattern", () => {
      // Generator version
      const withGenerator = (
        input: string,
      ): Result<number, ParseError | ValidationError> => {
        const program = function* (): Gen<
          number,
          ParseError | ValidationError
        > {
          const parsed = yield* gen(parse(input));
          const validated = yield* gen(validate(parsed));
          const doubled = yield* gen(double(validated));
          return doubled;
        };
        return runGen(program());
      };

      // Imperative version
      const imperative = (
        input: string,
      ): Result<number, ParseError | ValidationError> => {
        const parsed = parse(input);
        if (!parsed.ok) return parsed;

        const validated = validate(parsed.value);
        if (!validated.ok) return validated;

        const doubled = double(validated.value);
        if (!doubled.ok) return doubled;

        return ok(doubled.value);
      };

      // Both produce identical results
      assertEqual(withGenerator("21"), imperative("21"));
      assertEqual(withGenerator("abc"), imperative("abc"));
      assertEqual(withGenerator("-5"), imperative("-5"));
    });

    it("shows type inference works correctly", () => {
      const program = function* (): Gen<number, ParseError | ValidationError> {
        const a = yield* gen(parse("10"));
        const b = yield* gen(validate(a));
        return b * 2;
      };

      const result = runGen(program());

      assertType<typeof result, Result<number, ParseError | ValidationError>>();
    });

    it.skip("generator vs imperative performance", () => {
      const ITERATIONS = 500_000;

      const withGenerator = (input: string): Result<number, ParseError> =>
        runGen(
          (function* (): Gen<number, ParseError> {
            const a = yield* gen(parse(input));
            const b = yield* gen(parse(String(a + 1)));
            const c = yield* gen(parse(String(b + 1)));
            return c;
          })(),
        );

      type IterableResult<T, E> =
        | {
            readonly ok: true;
            readonly value: T;
            [Symbol.iterator](): Gen<T, E>;
          }
        | {
            readonly ok: false;
            readonly error: E;
            [Symbol.iterator](): Gen<T, E>;
          };

      const iterableOk = <T, E = never>(value: T): IterableResult<T, E> => ({
        ok: true,
        value,
        // oxlint-disable-next-line eslint/require-yield
        *[Symbol.iterator]() {
          return value;
        },
      });

      const iterableErr = <E, T = never>(error: E): IterableResult<T, E> => ({
        ok: false,
        error,
        *[Symbol.iterator]() {
          yield { ok: false, error };
          throw new Error("Unreachable");
        },
      });

      const parseIterable = (
        input: string,
      ): IterableResult<number, ParseError> => {
        const n = parseInt(input, 10);
        return isNaN(n) ? iterableErr({ type: "ParseError" }) : iterableOk(n);
      };

      const withIterableIterator = (
        input: string,
      ): Result<number, ParseError> =>
        runGen(
          (function* (): Gen<number, ParseError> {
            const a = yield* parseIterable(input);
            const b = yield* parseIterable(String(a + 1));
            const c = yield* parseIterable(String(b + 1));
            return c;
          })(),
        );

      const iterableProgram = function* (
        input: string,
      ): Gen<number, ParseError> {
        const a = yield* parseIterable(input);
        const b = yield* parseIterable(String(a + 1));
        const c = yield* parseIterable(String(b + 1));
        return c;
      };
      const withIterableIteratorHoisted = (
        input: string,
      ): Result<number, ParseError> => runGen(iterableProgram(input));

      const imperative = (input: string): Result<number, ParseError> => {
        const a = parse(input);
        if (!a.ok) return a;
        const b = parse(String(a.value + 1));
        if (!b.ok) return b;
        const c = parse(String(b.value + 1));
        if (!c.ok) return c;
        return ok(c.value);
      };

      const generatorStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        withGenerator("1");
      }
      const generatorTime = performance.now() - generatorStart;

      const iterableStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        withIterableIterator("1");
      }
      const iterableTime = performance.now() - iterableStart;

      const iterableHoistedStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        withIterableIteratorHoisted("1");
      }
      const iterableHoistedTime = performance.now() - iterableHoistedStart;

      const imperativeStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        imperative("1");
      }
      const imperativeTime = performance.now() - imperativeStart;

      /* oxlint-disable eslint/no-console -- This benchmark reports each measured implementation. */
      console.log(`Generator (wrapper): ${generatorTime.toFixed(2)} ms`);
      console.log(`Iterable (inline): ${iterableTime.toFixed(2)} ms`);
      console.log(`Iterable (hoisted): ${iterableHoistedTime.toFixed(2)} ms`);
      console.log(`Imperative: ${imperativeTime.toFixed(2)} ms`);
      console.log(
        `Generator wrapper is ${(generatorTime / imperativeTime).toFixed(1)}x slower`,
      );
      console.log(
        `Iterable inline is ${(iterableTime / imperativeTime).toFixed(1)}x slower`,
      );
      console.log(
        `Iterable hoisted is ${(iterableHoistedTime / imperativeTime).toFixed(1)}x slower`,
      );
      /* oxlint-enable eslint/no-console */
    });

    it("does not run a lazy generator called without yield*", () => {
      let operationRun = false;

      // oxlint-disable-next-line eslint/require-yield -- Generator bodies are lazy even without yield.
      const lazyOperation = function* (): Gen<number, never> {
        operationRun = true;
        return 1;
      };

      const program = function* (): Gen<void, never> {
        lazyOperation();
        return yield* gen(ok());
      };

      assertOk(runGen(program()), undefined);
      assertFalse(operationRun);
    });

    it("disposes resources when generator exits early on error", () => {
      // This test demonstrates that runGen properly cleans up resources
      // by calling gen.return() when it encounters an error.
      // This triggers finally blocks and `using` disposal in the generator.

      const disposed: Array<string> = [];

      const createTestResource = (
        id: string,
        shouldFail: boolean,
      ): Result<Disposable, ParseError> => {
        if (shouldFail) return err({ type: "ParseError" });
        return ok({
          [Symbol.dispose]: () => {
            disposed.push(id);
          },
        });
      };

      const program = function* (): Gen<string, ParseError> {
        using disposer = new DisposableStack();

        const r1 = yield* gen(createTestResource("db", false));
        disposer.use(r1);

        // This fails - generator yields Err and runGen calls gen.return()
        const r2 = yield* gen(createTestResource("file", true));
        disposer.use(r2);

        return "done";
      };

      const result = runGen(program());

      assertErr(result, { type: "ParseError" });
      // Resources ARE disposed because runGen calls gen.return() on error
      assertEqual(disposed, ["db"]);
    });

    it("disposes resources when generator completes successfully", () => {
      const disposed: Array<string> = [];

      const createTestResource = (id: string): Result<Disposable, ParseError> =>
        ok({
          [Symbol.dispose]: () => {
            disposed.push(id);
          },
        });

      const program = function* (): Gen<string, ParseError> {
        using disposer = new DisposableStack();

        const r1 = yield* gen(createTestResource("db"));
        disposer.use(r1);

        const r2 = yield* gen(createTestResource("file"));
        disposer.use(r2);

        return "done";
      };

      const result = runGen(program());

      assertOk(result, "done");
      // Resources ARE disposed on successful completion
      assertEqual(disposed, ["file", "db"]);
    });

    it("supports direct yield* with the iterator protocol", () => {
      type IterableResult<T, E> =
        | {
            readonly ok: true;
            readonly value: T;
            [Symbol.iterator](): Gen<T, E>;
          }
        | {
            readonly ok: false;
            readonly error: E;
            [Symbol.iterator](): Gen<T, E>;
          };

      const iterableOk = <T, E = never>(value: T): IterableResult<T, E> => ({
        ok: true,
        value,
        // oxlint-disable-next-line eslint/require-yield
        *[Symbol.iterator]() {
          return value;
        },
      });

      const iterableErr = <E, T = never>(error: E): IterableResult<T, E> => ({
        ok: false,
        error,
        *[Symbol.iterator]() {
          yield { ok: false, error };
          throw new Error("Unreachable");
        },
      });

      const parse = (input: string): IterableResult<number, ParseError> => {
        const n = parseInt(input, 10);
        return isNaN(n) ? iterableErr({ type: "ParseError" }) : iterableOk(n);
      };

      const validate = (n: number): IterableResult<number, ValidationError> =>
        n > 0 ? iterableOk(n) : iterableErr({ type: "ValidationError" });

      const program = function* (
        input: string,
      ): Gen<number, ParseError | ValidationError> {
        const parsed = yield* parse(input);
        const validated = yield* validate(parsed);
        return validated * 2;
      };

      assertEqual(runGen(program("21")), ok(42));
      assertEqual(runGen(program("abc")), err({ type: "ParseError" }));
      assertEqual(runGen(program("-5")), err({ type: "ValidationError" }));
    });
  });
});
