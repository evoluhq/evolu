import { expectErr, expectOk } from "@evolu/vitest";
import { assert, describe, expect, expectTypeOf, it, test } from "vitest";
import type { NonEmptyReadonlyArray } from "../../../../packages/common/src/Array.ts";
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
} from "../../../../packages/common/src/Result.ts";
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
} from "../../../../packages/common/src/Result.ts";
import { parseStackTrace } from "../../../../packages/common/src/StackTrace.ts";

describe("InferOk and InferErr", () => {
  it("infers Ok type", () => {
    type MyResult = Result<string, { type: "MyError"; code: number }>;
    expectTypeOf<InferOk<MyResult>>().toEqualTypeOf<string>();
  });

  it("infers Err type", () => {
    interface MyError {
      readonly type: "MyError";
      readonly code: number;
    }
    type MyResult = Result<string, MyError>;
    expectTypeOf<InferErr<MyResult>>().toEqualTypeOf<MyError>();
  });

  it("handles void Result", () => {
    type VoidResult = Result<void, Error>;
    expectTypeOf<InferOk<VoidResult>>().toEqualTypeOf<void>();
    expectTypeOf<InferErr<VoidResult>>().toEqualTypeOf<Error>();
  });

  it("works at runtime", () => {
    interface MyError {
      readonly type: "MyError";
      readonly code: number;
    }
    type MyResult = Result<string, MyError>;

    const okValue: InferOk<MyResult> = "hello";
    const errValue: InferErr<MyResult> = { type: "MyError", code: 404 };

    expect(okValue).toBe("hello");
    expect(errValue).toEqual({ type: "MyError", code: 404 });
  });
});

describe("ok", () => {
  it("creates Ok with a value", () => {
    expect(ok(42)).toStrictEqual({ ok: true, value: 42 });
  });

  it("creates Ok<void> without arguments", () => {
    expect(ok()).toStrictEqual({ ok: true, value: undefined });
  });

  it("caches ok() and ok(undefined)", () => {
    expect(ok()).toBe(ok());
    expect(ok(undefined)).toBe(ok());
  });

  it("rejects Ok<void> when Result expects a value", () => {
    // @ts-expect-error Type 'Ok<void>' is not assignable to type 'Result<string, Error>'
    const _result: Result<string, Error> = ok();
  });

  it("returns Result<T, never> for correct type inference", () => {
    const result = ok(42);
    expectTypeOf(result).toEqualTypeOf<Result<number>>();
  });

  it("infers never for E when combining with err", () => {
    interface MyError {
      readonly type: "MyError";
    }

    const example = (fail: boolean): Result<number, MyError> => {
      if (fail) return err({ type: "MyError" });
      return ok(42);
    };

    expectTypeOf(example(false)).toEqualTypeOf<Result<number, MyError>>();
  });
});

describe("err", () => {
  it("creates Err with an error", () => {
    expect(err("error")).toStrictEqual({ ok: false, error: "error" });
  });

  it("returns Result<never, E> for correct type inference", () => {
    const result = err("oops");
    expectTypeOf(result).toEqualTypeOf<Result<never, string>>();
  });
});

describe("isOk and isErr", () => {
  it("identifies Ok result", () => {
    const result = ok(123);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);

    if (isOk(result)) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    }
  });

  it("identifies Err result", () => {
    const result = err({ type: "TestError" as const });
    expect(isOk(result)).toBe(false);
    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expectTypeOf(result.error).toEqualTypeOf({ type: "TestError" as const });
    }
  });
});

describe("getOrThrow", () => {
  it("returns value for Ok", () => {
    expect(getOrThrow(ok(42))).toBe(42);
  });

  it("throws for Err", () => {
    expect(() => getOrThrow(err("error"))).toThrowErrorMatchingInlineSnapshot(
      `[Error: getOrThrow]`,
    );
  });

  it("includes primitive error as cause", () => {
    let thrown: unknown;
    try {
      getOrThrow(err("error"));
    } catch (e) {
      thrown = e;
    }
    const error = thrown as Error & { cause?: unknown };
    expect(error.cause).toBe("error");
  });

  it("includes Error instance as cause", () => {
    const original = new TypeError("boom");
    let thrown: unknown;
    try {
      getOrThrow(err(original));
    } catch (e) {
      thrown = e;
    }
    const error = thrown as Error & { cause?: unknown };
    expect(error.cause).toBe(original);
  });
});

describe("getOrNull", () => {
  it("returns value for Ok", () => {
    expect(getOrNull(ok(42))).toBe(42);
  });

  it("returns null for Err", () => {
    expect(getOrNull(err("error"))).toBeNull();
  });
});

describe("getOk", () => {
  it("extracts value from Result with never error", () => {
    const result = ok(42);
    expect(getOk(result)).toBe(42);
  });

  it("rejects Result with possible error type", () => {
    type IsAssignable =
      Result<number, string> extends Result<number> ? true : false;
    expectTypeOf<IsAssignable>().toEqualTypeOf<false>();
  });

  it("throws when invariant is violated at runtime", () => {
    const invalid = err("fail") as unknown as Result<number>;
    expect(() => getOk(invalid)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected Ok result.]`,
    );
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

    expect(result).toStrictEqual({
      ok: true,
      value: { key: "value" },
    });
  });

  it("returns Err on exception", () => {
    const result = trySync(
      () => JSON.parse("{key: value}") as unknown,
      (error): ParseError => ({ type: "ParseError", message: String(error) }),
    );

    expect(result).toStrictEqual({
      ok: false,
      error: {
        type: "ParseError",
        message: expect.stringContaining("SyntaxError"),
      },
    });
  });

  it("returns Err with the exception when mapError is omitted", () => {
    const failure = new Error("Something went wrong");
    const result = trySync(() => {
      throw failure;
    });

    expectTypeOf(result).toEqualTypeOf<Result<never, unknown>>();
    expect(result).toStrictEqual(err(failure));
  });

  it("mapError may throw to escalate a failure", () => {
    const failure = new Error("Something went wrong");
    const escalated = new Error("Escalated");

    let thrown: unknown;
    try {
      trySync(
        () => {
          throw failure;
        },
        () => {
          throw escalated;
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(escalated);
  });
});

describe("tryAsync", () => {
  it("returns Ok on resolved promise", async () => {
    const result = await tryAsync(
      () => Promise.resolve(),
      (error) => ({ type: "TestError", message: String(error) }),
    );

    expect(result).toStrictEqual(ok());
  });

  it("returns Err on rejected promise", async () => {
    const result = await tryAsync(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        throw new Error("Something went wrong");
      },
      (error) => ({ type: "TestError", message: String(error) }),
    );

    expect(result).toStrictEqual(
      err({
        type: "TestError",
        message: "Error: Something went wrong",
      }),
    );
  });

  it("returns Err with the rejection when mapError is omitted", async () => {
    const failure = new Error("Something went wrong");
    const result = await tryAsync(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        throw failure;
      },
    );

    expectTypeOf(result).toEqualTypeOf<Result<never, unknown>>();
    expect(result).toStrictEqual(err(failure));
  });

  it("maps custom error properties", async () => {
    const result = await tryAsync(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        throw new TypeError("Invalid type");
      },
      (error) => ({
        type: "CustomError",
        name: error instanceof Error ? error.name : "UnknownError",
        message: String(error),
      }),
    );

    expect(result).toStrictEqual(
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

    await expect(
      tryAsync(
        () => Promise.reject(failure),
        () => {
          throw escalated;
        },
      ),
    ).rejects.toBe(escalated);
  });

  it("catches synchronous throws", async () => {
    const result = await tryAsync(
      () => {
        throw new Error("Sync throw before promise");
      },
      (error) => ({ type: "TestError", message: String(error) }),
    );

    expect(result).toStrictEqual(
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

    expectErr(result, expect.any(Error));
    assert(result.error instanceof Error);

    expect(parseStackTrace(result.error.stack).files).toContain("Result.ts");
  });
});

describe("NextResult", () => {
  it("models success, failure, and done", () => {
    type E = "E";

    const a: NextResult<number, E, string> = ok(1);
    const b: NextResult<number, E, string> = err(done("finished"));
    const c: NextResult<number, E, string> = err<E>("E");

    expectTypeOf(a).toEqualTypeOf<NextResult<number, E, string>>();
    expect(b.ok).toBe(false);
    expect(c.ok).toBe(false);
  });

  it("extracts all type parameters", () => {
    type MyNextResult = NextResult<number, string, { summary: string }>;

    expectTypeOf<InferOk<MyNextResult>>().toEqualTypeOf<number>();
    expectTypeOf<InferErr<MyNextResult>>().toEqualTypeOf<
      string | Done<{ summary: string }>
    >();
    expectTypeOf<InferDone<MyNextResult>>().toEqualTypeOf<{
      summary: string;
    }>();
  });

  describe("done", () => {
    it("creates Done with done value", () => {
      expect(done("finished")).toStrictEqual({
        type: "Done",
        done: "finished",
      });
    });

    it("creates Done<void> without arguments", () => {
      expect(done()).toStrictEqual({
        type: "Done",
        done: undefined,
      });
      expectTypeOf(done()).toEqualTypeOf<Done<void>>();
    });

    it("preserves done type", () => {
      const value = done({ count: 1 });
      expectTypeOf(value).toEqualTypeOf<Done<{ count: number }>>();
      expectTypeOf(value.done).toEqualTypeOf<{ count: number }>();
    });
  });

  describe("ExcludeDone and OnlyDone", () => {
    it("ExcludeDone removes Done from a union", () => {
      interface MyError {
        readonly type: "MyError";
      }
      type E = MyError | Done<void>;
      expectTypeOf<ExcludeDone<E>>().toEqualTypeOf<MyError>();
    });

    it("OnlyDone keeps only Done from a union", () => {
      interface MyError {
        readonly type: "MyError";
      }
      type E = MyError | Done<"done">;
      expectTypeOf<OnlyDone<E>>().toEqualTypeOf<Done<"done">>();
    });

    it("OnlyDone returns never when there is no Done", () => {
      type E = "E";
      expectTypeOf<OnlyDone<E>>().toEqualTypeOf<never>();
    });
  });

  describe("InferDone", () => {
    it("extracts Done type from NextResult with void done", () => {
      type R = NextResult<number, string>;
      expectTypeOf<InferDone<R>>().toEqualTypeOf<void>();
    });

    it("extracts Done type from NextResult with complex done", () => {
      type R = NextResult<
        number,
        string,
        { count: number; items: Array<string> }
      >;
      expectTypeOf<InferDone<R>>().toEqualTypeOf<{
        count: number;
        items: Array<string>;
      }>();
    });

    it("returns never for Result without Done", () => {
      type R = Result<number, string>;
      expectTypeOf<InferDone<R>>().toEqualTypeOf<never>();
    });

    it("works with union errors containing Done", () => {
      interface MyError {
        readonly type: "MyError";
      }
      type R = Result<number, MyError | Done<string>>;
      expectTypeOf<InferDone<R>>().toEqualTypeOf<string>();
    });
  });
});

describe("flatMapResult", () => {
  it("composes an Ok with another Result-returning operation", () => {
    const result = flatMapResult(ok(21), (value) => ok(value * 2));

    expect(result).toStrictEqual(ok(42));
    expectTypeOf(result).toEqualTypeOf<Result<number>>();
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

    expect(result).toStrictEqual(err({ type: "FirstError" }));
    expect(called).toBe(false);
    expectTypeOf(result).toEqualTypeOf<
      Result<string, FirstError | SecondError>
    >();
  });

  it("returns an error from the next operation", () => {
    const result = flatMapResult(ok(42), () => err("fail"));

    expect(result).toStrictEqual(err("fail"));
  });
});

describe("allResult", () => {
  it("returns emptyArray for empty array", () => {
    const result = allResult([]);
    expect(result).toStrictEqual(ok([]));
  });

  it("returns emptyRecord for empty record", () => {
    const result = allResult({});
    expectOk(result, {});
  });

  it("extracts all values from array of Ok results", () => {
    const results = [ok(1), ok(2), ok(3)];
    expect(allResult(results)).toStrictEqual(ok([1, 2, 3]));
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
    expect(allResult(results)).toStrictEqual(err({ type: "E1" }));
  });

  it("extracts all values from struct", () => {
    const result = allResult({ a: ok(1), b: ok("two") });
    expectOk(result, { a: 1, b: "two" });
  });

  it("returns first error from struct", () => {
    const result = allResult({ a: ok(1), b: err("fail"), c: ok(3) });
    expect(result).toStrictEqual(err("fail"));
  });

  it("tuple preserves types", () => {
    const result = allResult([ok(1), ok("two"), ok(true)]);
    if (result.ok) {
      expectTypeOf(result.value[0]).toEqualTypeOf<number>();
      expectTypeOf(result.value[1]).toEqualTypeOf<string>();
      expectTypeOf(result.value[2]).toEqualTypeOf<boolean>();
    }
  });

  it("struct preserves types", () => {
    const result = allResult({ a: ok(1), b: ok("two") });
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<{ a: number; b: string }>();
    }
  });

  it("non-empty arrays preserve types", () => {
    const result = allResult([ok(1), ok(2)]);
    if (result.ok) {
      expectTypeOf(result.value[0]).toEqualTypeOf<number>();
      expectTypeOf(result.value[1]).toEqualTypeOf<number>();
    }
  });

  it("works with Iterable", () => {
    const set = new Set([ok(1), ok(2), ok(3)]);
    const result = allResult(set);
    expect(result).toStrictEqual(ok([1, 2, 3]));
  });

  it("returns an empty array for an empty non-array Iterable", () => {
    const results = new Set<Result<number>>();
    const result = allResult(results);

    expectTypeOf(result).toEqualTypeOf<Result<ReadonlyArray<number>>>();
    expect(result).toStrictEqual(ok([]));
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

    expectErr(result, "fail");
    expect(consumedValues).toEqual([1, 2]);
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

    expectOk(result, { own: 1 });
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

    expectTypeOf(result).toEqualTypeOf<
      Result<void, FirstError | SecondError>
    >();
    expectOk(result, undefined);
  });

  it("returns the first Err without collecting Ok values", () => {
    const result = allResult([ok(1), err("first"), err("second")], {
      collect: false,
    });

    expectErr(result, "first");
  });

  it("does not collect Ok values from a record", () => {
    const result = allResult(
      { first: ok(1), second: err("fail") },
      { collect: false },
    );

    expectTypeOf(result).toEqualTypeOf<Result<void, string>>();
    expectErr(result, "fail");
  });
});

describe("allResult mapping overload", () => {
  it("returns emptyArray for empty array", () => {
    const result = allResult([], (x: number) => ok(x * 2));
    expect(result).toStrictEqual(ok([]));
  });

  it("returns emptyRecord for empty record", () => {
    const result = allResult({}, (x: number) => ok(x * 2));
    expectOk(result, {});
  });

  it("maps items and collects results", () => {
    const result = allResult([1, 2, 3], (x) => ok(x * 2));
    expect(result).toStrictEqual(ok([2, 4, 6]));
  });

  it("returns first error", () => {
    const result = allResult([1, 2, 3], (x) =>
      x === 2 ? err("fail") : ok(x * 2),
    );
    expect(result).toStrictEqual(err("fail"));
  });

  it("does not map values after the first error", () => {
    const mappedValues: Array<number> = [];
    const result = allResult([1, 2, 3], (value) => {
      mappedValues.push(value);
      return value === 2 ? err("fail") : ok(value * 2);
    });

    expect(result).toStrictEqual(err("fail"));
    expect(mappedValues).toEqual([1, 2]);
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

    expectTypeOf(result).toEqualTypeOf<
      Result<readonly [void, void], FirstError | SecondError>
    >();
    expectErr(result, { type: "SecondError" });
  });

  it("does not collect mapped Ok values", () => {
    const result = allResult([1, 2, 3], (value) => ok(value * 2), {
      collect: false,
    });

    expectTypeOf(result).toEqualTypeOf<Result<void>>();
    expectOk(result, undefined);
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

    expectTypeOf(result).toEqualTypeOf<
      Result<void, FirstError | SecondError>
    >();
    expectErr(result, { type: "SecondError" });
    expect(calls).toEqual(["first", "second"]);
  });

  it("maps struct and collects results", () => {
    const result = allResult({ a: 1, b: 2 }, (x) => ok(x * 2));
    expectOk(result, { a: 2, b: 4 });
  });

  it("maps a record without collecting Ok values", () => {
    const result = allResult({ a: 1, b: 2 }, (x) => ok(x * 2), {
      collect: false,
    });

    expectTypeOf(result).toEqualTypeOf<Result<void>>();
    expectOk(result, undefined);
  });

  it("returns first error from struct", () => {
    const result = allResult({ a: 1, b: 2, c: 3 }, (x) =>
      x === 2 ? err("fail") : ok(x * 2),
    );
    expect(result).toStrictEqual(err("fail"));
  });

  it("struct preserves types", () => {
    const result = allResult({ a: 1, b: 2 }, (x) => ok(String(x)));
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<
        Readonly<Record<"a" | "b", string>>
      >();
    }
  });

  it("non-empty arrays preserve types", () => {
    const result = allResult([1, 2, 3], (x) => ok(x * 2));
    if (result.ok) {
      expectTypeOf(result.value[0]).toEqualTypeOf<number>();
      expectTypeOf(result.value[1]).toEqualTypeOf<number>();
      expectTypeOf(result.value[2]).toEqualTypeOf<number>();
    }
  });

  it("works with Iterable", () => {
    const set = new Set([1, 2, 3]);
    const result = allResult(set, (x) => ok(x * 2));
    expect(result).toStrictEqual(ok([2, 4, 6]));
  });
});

describe("anyResult", () => {
  it("returns first success", () => {
    expect(anyResult([err("a"), ok(42), err("b")])).toStrictEqual(ok(42));
  });

  it("returns last error when all fail", () => {
    expect(anyResult([err("a"), err("b"), err("c")])).toStrictEqual(err("c"));
  });

  it("returns first Ok even if it's first", () => {
    expect(anyResult([ok(1), ok(2), ok(3)])).toStrictEqual(ok(1));
  });

  it("preserves types", () => {
    const result = anyResult([err({ type: "E1" as const }), ok(42)]);
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
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

  if (!json.ok) return json;

  expectTypeOf(json.value).toBeUnknown();
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
        expect(resource.value.isDisposed()).toBe(false);
      }

      expect(resource.value.isDisposed()).toBe(true);
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
      expectErr(result, {
        type: "CreateResourceError",
        reason: "other failure",
      });
      expect(resource?.isDisposed()).toBe(true);
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

      expect(() => {
        process();
      }).toThrow("Unexpected!");
      expect(resource?.isDisposed()).toBe(true);
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
      expect(log).toEqual([
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
      expectOk(result, "processed");
      expect(disposed).toEqual(["file", "db"]);
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
      expectErr(result, {
        type: "CreateResourceError",
        reason: "Failed to create file",
      });
      expect(disposed).toEqual(["db"]);
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
      expectErr(result, {
        type: "CreateResourceError",
        reason: "Failed to create db",
      });
      expect(disposed).toEqual([]);
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
      expectOk(result, ["result for: SELECT * FROM users"]);
      expect(connectionClosed).toBe(true);
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
      expectErr(result, { type: "ProcessingError", step: "step2" });
      expect(log).toEqual(["work:step1", "cleanup:cache", "cleanup:db"]);
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
      expect(() => processResources()).toThrow("Unexpected bug!");
      expect(disposed).toEqual(["db"]);
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
      expectOk(result, undefined);
      expect(disposed).toEqual(["work", "b", "a"]);
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
      expectOk(result, "processed");
      expect(disposed).toEqual(["file", "db"]);
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
      expectErr(result, {
        type: "CreateResourceError",
        reason: "Failed to create file",
      });
      expect(disposed).toEqual(["db"]);
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
      expectOk(result, "mixed");
      expect(disposed).toEqual(["async", "sync"]);
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
    // eslint-disable-next-line func-style -- generators require function keyword
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
      expect(success).toStrictEqual(ok(42));

      // Parse error
      const parseErr = runGen(program("not a number"));
      expect(parseErr).toStrictEqual(err({ type: "ParseError" }));

      // Validation error
      const validationErr = runGen(program("-5"));
      expect(validationErr).toStrictEqual(err({ type: "ValidationError" }));
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
      expect(withGenerator("21")).toStrictEqual(imperative("21"));
      expect(withGenerator("abc")).toStrictEqual(imperative("abc"));
      expect(withGenerator("-5")).toStrictEqual(imperative("-5"));
    });

    it("shows type inference works correctly", () => {
      const program = function* (): Gen<number, ParseError | ValidationError> {
        const a = yield* gen(parse("10"));
        const b = yield* gen(validate(a));
        return b * 2;
      };

      const result = runGen(program());

      expectTypeOf(result).toEqualTypeOf<
        Result<number, ParseError | ValidationError>
      >();
    });

    test.skip("generator vs imperative performance", () => {
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
        // eslint-disable-next-line require-yield
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

      // eslint-disable-next-line no-console
      console.log(`Generator (wrapper): ${generatorTime.toFixed(2)} ms`);
      // eslint-disable-next-line no-console
      console.log(`Iterable (inline): ${iterableTime.toFixed(2)} ms`);
      // eslint-disable-next-line no-console
      console.log(`Iterable (hoisted): ${iterableHoistedTime.toFixed(2)} ms`);
      // eslint-disable-next-line no-console
      console.log(`Imperative: ${imperativeTime.toFixed(2)} ms`);
      // eslint-disable-next-line no-console
      console.log(
        `Generator wrapper is ${(generatorTime / imperativeTime).toFixed(1)}x slower`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `Iterable inline is ${(iterableTime / imperativeTime).toFixed(1)}x slower`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `Iterable hoisted is ${(iterableHoistedTime / imperativeTime).toFixed(1)}x slower`,
      );
    });

    it("does not run a lazy generator called without yield*", () => {
      let operationRun = false;

      // eslint-disable-next-line require-yield -- generator bodies are lazy even without yield
      const lazyOperation = function* (): Gen<number, never> {
        operationRun = true;
        return 1;
      };

      const program = function* (): Gen<void, never> {
        lazyOperation();
        return yield* gen(ok());
      };

      expectOk(runGen(program()), undefined);
      expect(operationRun).toBe(false);
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

      expectErr(result, { type: "ParseError" });
      // Resources ARE disposed because runGen calls gen.return() on error
      expect(disposed).toEqual(["db"]);
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

      expectOk(result, "done");
      // Resources ARE disposed on successful completion
      expect(disposed).toEqual(["file", "db"]);
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
        // eslint-disable-next-line require-yield
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

      expect(runGen(program("21"))).toStrictEqual(ok(42));
      expect(runGen(program("abc"))).toStrictEqual(err({ type: "ParseError" }));
      expect(runGen(program("-5"))).toStrictEqual(
        err({ type: "ValidationError" }),
      );
    });
  });
});
