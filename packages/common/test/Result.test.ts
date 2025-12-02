import { describe, expect, expectTypeOf, it, test } from "vitest";
import {
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

describe("Result with using keyword", () => {
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

describe("Result with DisposableStack", () => {
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

describe("Result with AsyncDisposableStack", () => {
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
