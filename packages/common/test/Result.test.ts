import { describe, expect, expectTypeOf, it, test } from "vitest";
import {
  Err,
  err,
  getOrThrow,
  InferErr,
  InferOk,
  ok,
  Result,
  tryAsync,
  trySync,
} from "../src/Result.js";

describe("ok", () => {
  it("creates Ok with a value", () => {
    expect(ok(42)).toStrictEqual({ ok: true, value: 42 });
  });

  it("creates Ok<void> without arguments", () => {
    expect(ok()).toStrictEqual({ ok: true, value: undefined });
  });

  it("rejects Ok<void> when Result expects a value", () => {
    // @ts-expect-error Type 'Ok<void>' is not assignable to type 'Result<string, Error>'
    const _result: Result<string, Error> = ok();
  });
});

describe("err", () => {
  it("creates Err with an error", () => {
    expect(err("error")).toStrictEqual({ ok: false, error: "error" });
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
});

describe("tryAsync", () => {
  it("returns Ok on resolved promise", async () => {
    const result = await tryAsync(
      () => Promise.resolve("success"),
      (error) => ({ type: "TestError", message: String(error) }),
    );

    expect(result).toStrictEqual(ok("success"));
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
});

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
});

test.skip("Result wrapping vs unwrapped performance", () => {
  const MESSAGE_SIZE = 50_000;
  const AVG_ITEM_SIZE = 8;
  const NUM_ITEMS = Math.floor(MESSAGE_SIZE / AVG_ITEM_SIZE);

  const data = new Uint8Array(MESSAGE_SIZE);
  data.fill(1);

  const readWrapped = (
    bytes: Uint8Array,
    offset: number,
    size: number,
  ): Result<Uint8Array, string> => {
    return ok(bytes.subarray(offset, offset + size));
  };

  const readUnwrapped = (
    bytes: Uint8Array,
    offset: number,
    size: number,
  ): Uint8Array => {
    return bytes.subarray(offset, offset + size);
  };

  const wrappedStart = performance.now();
  for (let offset = 0, i = 0; i < NUM_ITEMS; i++, offset += AVG_ITEM_SIZE) {
    const result = readWrapped(data, offset, AVG_ITEM_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    if (result.ok) result.value;
  }
  const wrappedTime = performance.now() - wrappedStart;

  const unwrappedStart = performance.now();
  for (let offset = 0, i = 0; i < NUM_ITEMS; i++, offset += AVG_ITEM_SIZE) {
    const chunk = readUnwrapped(data, offset, AVG_ITEM_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    chunk;
  }
  const unwrappedTime = performance.now() - unwrappedStart;

  // eslint-disable-next-line no-console
  console.log(`Wrapped: ${wrappedTime.toFixed(2)} ms for ${NUM_ITEMS} items`);
  // eslint-disable-next-line no-console
  console.log(
    `Unwrapped: ${unwrappedTime.toFixed(2)} ms for ${NUM_ITEMS} items`,
  );
  // eslint-disable-next-line no-console
  console.log(`Difference: ${(wrappedTime - unwrappedTime).toFixed(2)} ms`);
});

// --- Result with Resource Management ---
//
// Result and Resource Management are orthogonal concerns:
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

describe("Result with Resource Management", () => {
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
      expect(result.ok).toBe(false);
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
        } // lock "a" released here

        log.push("between");

        {
          using _ = createLock("b");
          log.push("critical-section-b");
        } // lock "b" released here

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
        using stack = new DisposableStack();

        const resource1 = createResource("db", false);
        if (!resource1.ok) return resource1;
        stack.use(resource1.value);
        stack.defer(() => disposed.push("db"));

        const resource2 = createResource("file", false);
        if (!resource2.ok) return resource2;
        stack.use(resource2.value);
        stack.defer(() => disposed.push("file"));

        return ok("processed");
      };

      const result = processResources();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("processed");
      }
      expect(disposed).toEqual(["file", "db"]);
    });

    it("disposes created resources when later creation fails", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using stack = new DisposableStack();

        const resource1 = createResource("db", false);
        if (!resource1.ok) return resource1;
        stack.use(resource1.value);
        stack.defer(() => disposed.push("db"));

        const resource2 = createResource("file", true);
        if (!resource2.ok) return resource2;

        stack.use(resource2.value);
        stack.defer(() => disposed.push("file"));

        return ok("processed");
      };

      const result = processResources();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("CreateResourceError");
        expect(result.error.reason).toBe("Failed to create file");
      }
      expect(disposed).toEqual(["db"]);
    });

    it("disposes nothing when first creation fails", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using stack = new DisposableStack();

        const resource1 = createResource("db", true);
        if (!resource1.ok) return resource1;
        stack.use(resource1.value);
        stack.defer(() => disposed.push("db"));

        return ok("processed");
      };

      const result = processResources();
      expect(result.ok).toBe(false);
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
        using stack = new DisposableStack();

        const conn = openConnection(false);
        if (!conn.ok) return conn;

        stack.adopt(conn.value, closeConnection);

        return ok(conn.value.query("SELECT * FROM users"));
      };

      const result = queryDatabase();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(["result for: SELECT * FROM users"]);
      }
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
        using stack = new DisposableStack();

        const db = createResource("db", false);
        if (!db.ok) return db;
        stack.use(db.value);
        stack.defer(() => log.push("cleanup:db"));

        const cache = createResource("cache", false);
        if (!cache.ok) return cache;
        stack.use(cache.value);
        stack.defer(() => log.push("cleanup:cache"));

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
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("ProcessingError");
      }
      expect(log).toEqual(["work:step1", "cleanup:cache", "cleanup:db"]);
    });

    it("disposes resources even when unexpected error is thrown", () => {
      const disposed: Array<string> = [];

      const processResources = (): Result<string, CreateResourceError> => {
        using stack = new DisposableStack();

        const resource1 = createResource("db", false);
        if (!resource1.ok) return resource1;
        stack.use(resource1.value);
        stack.defer(() => disposed.push("db"));

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
        using stack = new DisposableStack();

        const r1 = createResource("a", false);
        if (!r1.ok) return r1;
        stack.use(r1.value);
        stack.defer(() => disposed.push("a"));

        const r2 = createResource("b", false);
        if (!r2.ok) return r2;
        stack.use(r2.value);
        stack.defer(() => disposed.push("b"));

        return ok(stack.move());
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
      expect(result.ok).toBe(true);
      expect(disposed).toEqual(["work", "b", "a"]);
    });
  });

  describe("AsyncDisposableStack", () => {
    it("disposes async resources on successful completion", async () => {
      const disposed: Array<string> = [];

      const processResources = async (): Promise<
        Result<string, CreateResourceError>
      > => {
        await using stack = new AsyncDisposableStack();

        const resource1 = await createAsyncResource("db", false);
        if (!resource1.ok) return resource1;
        stack.use(resource1.value);
        stack.defer(async () => {
          await Promise.resolve();
          disposed.push("db");
        });

        const resource2 = await createAsyncResource("file", false);
        if (!resource2.ok) return resource2;
        stack.use(resource2.value);
        stack.defer(async () => {
          await Promise.resolve();
          disposed.push("file");
        });

        return ok("processed");
      };

      const result = await processResources();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("processed");
      }
      expect(disposed).toEqual(["file", "db"]);
    });

    it("disposes created async resources when later creation fails", async () => {
      const disposed: Array<string> = [];

      const processResources = async (): Promise<
        Result<string, CreateResourceError>
      > => {
        await using stack = new AsyncDisposableStack();

        const resource1 = await createAsyncResource("db", false);
        if (!resource1.ok) return resource1;
        stack.use(resource1.value);
        stack.defer(async () => {
          await Promise.resolve();
          disposed.push("db");
        });

        const resource2 = await createAsyncResource("file", true);
        if (!resource2.ok) return resource2;
        stack.use(resource2.value);
        stack.defer(async () => {
          await Promise.resolve();
          disposed.push("file");
        });

        return ok("processed");
      };

      const result = await processResources();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.reason).toBe("Failed to create file");
      }
      expect(disposed).toEqual(["db"]);
    });

    it("can mix sync and async resources", async () => {
      const disposed: Array<string> = [];

      const processResources = async (): Promise<
        Result<string, CreateResourceError>
      > => {
        await using stack = new AsyncDisposableStack();

        const syncResource = createResource("sync", false);
        if (!syncResource.ok) return syncResource;
        stack.use(syncResource.value);
        stack.defer(() => {
          disposed.push("sync");
        });

        const asyncResource = await createAsyncResource("async", false);
        if (!asyncResource.ok) return asyncResource;
        stack.use(asyncResource.value);
        stack.defer(async () => {
          await Promise.resolve();
          disposed.push("async");
        });

        return ok("mixed");
      };

      const result = await processResources();
      expect(result.ok).toBe(true);
      expect(disposed).toEqual(["async", "sync"]);
    });
  });
});

/**
 * This test demonstrates generator-based monadic composition patterns for
 * Result types, comparing Evolu's plain object approach with Effect's iterator
 * protocol approach.
 *
 * ### Imperative pattern
 *
 * ```ts
 * const imperative = (
 *   input: string,
 * ): Result<number, ParseError | ValidationError> => {
 *   const parsed = parse(input);
 *   if (!parsed.ok) return parsed;
 *
 *   const validated = validate(parsed.value);
 *   if (!validated.ok) return validated;
 *
 *   const doubled = double(validated.value);
 *   if (!doubled.ok) return doubled;
 *
 *   return ok(doubled.value);
 * };
 * ```
 *
 * Pros:
 *
 * - Explicit control flow, easy to follow
 * - No extra abstractions beyond Result itself
 * - No generator/iterator overhead
 *
 * Cons:
 *
 * - Repetitive `if (!x.ok) return x` boilerplate
 *
 * ### Generator pattern (with gen() wrapper)
 *
 * ```ts
 * const program = function* (
 *   input: string,
 * ): Gen<number, ParseError | ValidationError> {
 *   const parsed = yield* gen(parse(input));
 *   const validated = yield* gen(validate(parsed));
 *   const doubled = yield* gen(double(validated));
 *   return doubled;
 * };
 * ```
 *
 * ### Generator pattern (with iterator protocol, like Effect)
 *
 * ```ts
 * const program = function* (
 *   input: string,
 * ): Gen<number, ParseError | ValidationError> {
 *   const parsed = yield* parse(input); // No gen() needed
 *   const validated = yield* validate(parsed);
 *   const doubled = yield* double(validated);
 *   return doubled;
 * };
 * ```
 *
 * Pros:
 *
 * - Automatic error propagation via `yield*` (no need to access Result's value
 *   property)
 *
 * Cons:
 *
 * - Requires understanding generators plus the Gen/runGen helpers
 * - Less familiar to many JS/TS developers
 * - Slower (see perf test)
 *
 * ### Performance (Apple M1, 500K iterations, 3-step chain)
 *
 * - Imperative: ~25 ms
 * - Generator (gen wrapper): ~330 ms (~13x slower)
 * - Iterator protocol (IIFE): ~1200 ms (~48x slower)
 * - Iterator protocol (hoisted): ~990 ms (~40x slower)
 *
 * ### Conclusion
 *
 * The performance difference matters. In applications with many Result
 * operations, this accumulates quickly.
 *
 * However, Evolu prefers the imperative pattern for a different reason:
 * avoiding Buridan's ass (https://en.wikipedia.org/wiki/Buridan%27s_ass).
 * Having two equivalent ways to write code forces developers to choose between
 * them, second-guess their decisions, and refactor for no real benefit. The `if
 * (!x.ok) return x` pattern isn't worse than `yield*` - it's just different
 * syntax for the same control flow.
 *
 * Additionally, generators are harder to debug - they create synthetic call
 * stacks and stepping through `yield*` in a debugger is less intuitive than
 * stepping through regular function calls.
 *
 * Last but not least, plain object Results can be easily serialized (e.g., for
 * inter-process communication, storage, or logging), while Effect-style Results
 * with `[Symbol.iterator]` methods cannot without custom serialization and
 * deserialization.
 *
 * Therefore, Evolu doesn't want to use generators for Result composition and
 * will never export generator-based helpers.
 */
describe("generator-based composition", () => {
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
  function* gen<T, E>(result: Result<T, E>): Gen<T, E> {
    if (result.ok) {
      return result.value;
    } else {
      yield result;
      // This line is never reached - the runner exits on first yielded Err
      throw new Error("Unreachable");
    }
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

  const double = (n: number): Result<number, never> => ok(n * 2);

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
      const program = function* (): Gen<number, ParseError | ValidationError> {
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

    // Generator version (requires gen() wrapper)
    const withGenerator = (input: string): Result<number, ParseError> =>
      runGen(
        (function* (): Gen<number, ParseError> {
          const a = yield* gen(parse(input));
          const b = yield* gen(parse(String(a + 1)));
          const c = yield* gen(parse(String(b + 1)));
          return c;
        })(),
      );

    // Effect-style Result with iterator protocol (no gen() wrapper needed)
    type EffectResult<T, E> =
      | { readonly ok: true; readonly value: T; [Symbol.iterator](): Gen<T, E> }
      | {
          readonly ok: false;
          readonly error: E;
          [Symbol.iterator](): Gen<T, E>;
        };

    const effectOk = <T, E = never>(value: T): EffectResult<T, E> => ({
      ok: true,
      value,
      // eslint-disable-next-line require-yield
      *[Symbol.iterator]() {
        return value;
      },
    });

    const effectErr = <E, T = never>(error: E): EffectResult<T, E> => ({
      ok: false,
      error,
      *[Symbol.iterator]() {
        yield { ok: false, error } as Err<E>;
        throw new Error("Unreachable");
      },
    });

    const parseEffect = (input: string): EffectResult<number, ParseError> => {
      const n = parseInt(input, 10);
      return isNaN(n) ? effectErr({ type: "ParseError" }) : effectOk(n);
    };

    // Effect-style generator (no gen() wrapper)
    const withEffectIterator = (input: string): Result<number, ParseError> =>
      runGen(
        (function* (): Gen<number, ParseError> {
          const a = yield* parseEffect(input);
          const b = yield* parseEffect(String(a + 1));
          const c = yield* parseEffect(String(b + 1));
          return c;
        })(),
      );

    // Effect-style with hoisted generator function
    const effectProgram = function* (input: string): Gen<number, ParseError> {
      const a = yield* parseEffect(input);
      const b = yield* parseEffect(String(a + 1));
      const c = yield* parseEffect(String(b + 1));
      return c;
    };
    const withEffectIteratorHoisted = (
      input: string,
    ): Result<number, ParseError> => runGen(effectProgram(input));

    // Imperative version
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

    const effectStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      withEffectIterator("1");
    }
    const effectTime = performance.now() - effectStart;

    const effectHoistedStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      withEffectIteratorHoisted("1");
    }
    const effectHoistedTime = performance.now() - effectHoistedStart;

    const imperativeStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      imperative("1");
    }
    const imperativeTime = performance.now() - imperativeStart;

    // eslint-disable-next-line no-console
    console.log(`Generator (gen wrapper):     ${generatorTime.toFixed(2)} ms`);
    // eslint-disable-next-line no-console
    console.log(`Iterator (IIFE):             ${effectTime.toFixed(2)} ms`);
    // eslint-disable-next-line no-console
    console.log(
      `Iterator (hoisted):          ${effectHoistedTime.toFixed(2)} ms`,
    );
    // eslint-disable-next-line no-console
    console.log(`Imperative:                  ${imperativeTime.toFixed(2)} ms`);
    // eslint-disable-next-line no-console
    console.log(
      `gen wrapper is ${(generatorTime / imperativeTime).toFixed(1)}x slower`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `iterator IIFE is ${(effectTime / imperativeTime).toFixed(1)}x slower`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `iterator hoisted is ${(effectHoistedTime / imperativeTime).toFixed(1)}x slower`,
    );
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
      using stack = new DisposableStack();

      const r1 = yield* gen(createTestResource("db", false));
      stack.use(r1);

      // This fails - generator yields Err and runGen calls gen.return()
      const r2 = yield* gen(createTestResource("file", true));
      stack.use(r2);

      return "done";
    };

    const result = runGen(program());

    expect(result.ok).toBe(false);
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
      using stack = new DisposableStack();

      const r1 = yield* gen(createTestResource("db"));
      stack.use(r1);

      const r2 = yield* gen(createTestResource("file"));
      stack.use(r2);

      return "done";
    };

    const result = runGen(program());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("done");
    // Resources ARE disposed on successful completion
    expect(disposed).toEqual(["file", "db"]);
  });

  /**
   * Effect's Result (Either) implements `[Symbol.iterator]`, allowing direct
   * `yield*` without a wrapper. This test demonstrates that pattern.
   */
  it("shows Effect-style iterator protocol (no gen wrapper needed)", () => {
    // Effect-style Result with built-in iterator protocol
    type EffectResult<T, E> =
      | { readonly ok: true; readonly value: T; [Symbol.iterator](): Gen<T, E> }
      | {
          readonly ok: false;
          readonly error: E;
          [Symbol.iterator](): Gen<T, E>;
        };

    // Factory functions that add iterator protocol
    const effectOk = <T, E = never>(value: T): EffectResult<T, E> => ({
      ok: true,
      value,
      // eslint-disable-next-line require-yield
      *[Symbol.iterator]() {
        return value;
      },
    });

    const effectErr = <E, T = never>(error: E): EffectResult<T, E> => ({
      ok: false,
      error,
      *[Symbol.iterator]() {
        yield { ok: false, error } as Err<E>;
        throw new Error("Unreachable");
      },
    });

    // Operations returning Effect-style Result
    const parse = (input: string): EffectResult<number, ParseError> => {
      const n = parseInt(input, 10);
      return isNaN(n) ? effectErr({ type: "ParseError" }) : effectOk(n);
    };

    const validate = (n: number): EffectResult<number, ValidationError> =>
      n > 0 ? effectOk(n) : effectErr({ type: "ValidationError" });

    // With iterator protocol: direct yield* without gen() wrapper
    const program = function* (
      input: string,
    ): Gen<number, ParseError | ValidationError> {
      const parsed = yield* parse(input); // No gen() needed!
      const validated = yield* validate(parsed); // No gen() needed!
      return validated * 2;
    };

    expect(runGen(program("21"))).toStrictEqual(ok(42));
    expect(runGen(program("abc"))).toStrictEqual(err({ type: "ParseError" }));
    expect(runGen(program("-5"))).toStrictEqual(
      err({ type: "ValidationError" }),
    );
  });
});
