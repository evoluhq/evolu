import { describe, it } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertRejects,
  assertSame,
  assertTrue,
} from "./Assert.ts";

import {
  fetch,
  testCreateNativeFetchErroringBody,
  testCreateNativeFetch,
  type FetchError,
  type FetchResponse,
  type FetchTransportError,
} from "./Http.ts";
import { err, ok, type Result } from "./Result.ts";
import {
  createAbortError,
  createPanicAbortReason,
  testAbortError,
  testAbortReason,
  testCreateRun,
  type Task,
} from "./Task.ts";
import { assertType } from "./Type.ts";

describe("fetch", () => {
  it("uses deps.nativeFetch with init and the Task Run signal", async () => {
    const headers = new Headers({ accept: "text/plain" });
    const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
    await using run = testCreateRun({ nativeFetch });

    const fiber = run(fetch("/hello", "text", { headers }));
    const result = await fiber;

    assertOk(result, "hello");
    assertEqual(nativeFetch.calls, [
      {
        input: "/hello",
        init: { headers, signal: fiber.run.signal },
      },
    ]);
  });

  it("returns FetchTransportError when the test default nativeFetch is not replaced", async () => {
    await using run = testCreateRun();

    const result = await run(fetch("/missing-test-double", "text"));

    assertErr(result);
    assertSame(result.error.type, "FetchTransportError");
    assertInstanceOf(result.error.error, Error);
    assertEqual(
      result.error.error.message,
      "Provide a nativeFetch test double",
    );
  });

  it("returns FetchTransportError when test nativeFetch has no queued handler", async () => {
    const nativeFetch = testCreateNativeFetch();
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/unexpected", "text"));

    assertErr(result);
    assertSame(result.error.type, "FetchTransportError");
    assertInstanceOf(result.error.error, Error);
    assertEqual(result.error.error.message, "Unexpected NativeFetch call");
  });

  it("test nativeFetch queues handlers after creation", async () => {
    const nativeFetch = testCreateNativeFetch();
    nativeFetch.handle(() => new Response("hello"));
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/queued", "text"));

    assertOk(result, "hello");
  });

  it("returns FetchTransportError when nativeFetch rejects asynchronously", async () => {
    const failure = new Error("network failed");
    const nativeFetch = testCreateNativeFetch(() => Promise.reject(failure));
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/network-failure", "text"));

    assertErr(result, {
      type: "FetchTransportError",
      error: failure,
    });
  });

  it("infers overload result types", () => {
    interface TestError {
      readonly type: "TestError";
    }

    {
      const actual = fetch("/text", "text");
      assertType<typeof actual, Task<string, FetchError>>();
    }
    {
      const actual = fetch("/json", "json");
      assertType<typeof actual, Task<unknown, FetchError>>();
    }
    {
      const actual = fetch("/bytes", "bytes");
      assertType<typeof actual, Task<Uint8Array<ArrayBuffer>, FetchError>>();
    }
    {
      const actual = fetch("/headers", "headers");
      assertType<typeof actual, Task<FetchResponse, FetchTransportError>>();
    }
    {
      const actual = fetch("/consumer", () => ok("value"));
      assertType<typeof actual, Task<string, FetchTransportError>>();
    }
    {
      const actual = fetch("/consumer-error", (): Result<string, TestError> =>
        err({ type: "TestError" }),
      );
      assertType<
        typeof actual,
        Task<string, FetchTransportError | TestError>
      >();
    }
  });

  describe("body modes", () => {
    describe("2xx response returns", () => {
      it("text as string", async () => {
        const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/hello", "text"));

        assertOk(result, "hello");
      });

      it("json as unknown", async () => {
        const nativeFetch = testCreateNativeFetch(
          () => new Response('{"name":"Ada"}'),
        );
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/user", "json"));

        assertOk(result, { name: "Ada" });
      });

      it("bytes as Uint8Array", async () => {
        const nativeFetch = testCreateNativeFetch(
          () => new Response(new Uint8Array([1, 2, 3])),
        );
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/bytes", "bytes"));

        assertOk(result, new Uint8Array([1, 2, 3]));
      });
    });

    describe("non-2xx response returns FetchStatusError", () => {
      it("drains body as text", async () => {
        const response = new Response("denied", {
          status: 404,
          statusText: "Not Found",
        });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/missing", "text"));

        assertErr(result, {
          type: "FetchStatusError",
          response,
          body: ok("denied"),
        });
      });

      it("json does not attempt JSON parsing", async () => {
        const response = Object.assign(
          new Response("denied", {
            status: 404,
            statusText: "Not Found",
          }),
          {
            json: () => Promise.reject(new Error("json reader was called")),
          },
        );
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/missing", "json"));

        assertErr(result, {
          type: "FetchStatusError",
          response,
          body: ok("denied"),
        });
      });

      it("stores body read error from text drain", async () => {
        const failure = new Error("stream failed");
        const response = Object.assign(
          new Response(null, {
            status: 500,
            statusText: "Internal Server Error",
          }),
          { text: () => Promise.reject(failure) },
        );
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/broken", "text"));

        assertErr(result, {
          type: "FetchStatusError",
          response,
          body: err(failure),
        });
      });
    });

    describe("2xx response returns FetchBodyError for", () => {
      it("text body read failure", async () => {
        const failure = new Error("stream failed");
        const response = new Response(
          testCreateNativeFetchErroringBody(failure),
        );
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/broken", "text"));

        assertErr(result);
        assertSame(result.error.type, "FetchBodyError");
        assertSame(result.error.response, response);
        assertSame(result.error.error, failure);
      });

      it("json invalid JSON", async () => {
        const response = new Response("not json");
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/invalid", "json"));

        assertErr(result);
        assertSame(result.error.type, "FetchBodyError");
        assertSame(result.error.response, response);
        assertInstanceOf(result.error.error, SyntaxError);
      });

      it("json empty body such as 204", async () => {
        const response = new Response(null, { status: 204 });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/empty", "json"));

        assertErr(result);
        assertSame(result.error.type, "FetchBodyError");
        assertSame(result.error.response, response);
        assertInstanceOf(result.error.error, SyntaxError);
      });

      it("bytes body read failure", async () => {
        const failure = new Error("stream failed");
        const response = Object.assign(new Response(), {
          bytes: () => Promise.reject(failure),
        });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/broken", "bytes"));

        assertErr(result, {
          type: "FetchBodyError",
          response,
          error: failure,
        });
      });
    });
  });

  describe("headers mode", () => {
    it("returns plain response metadata", async () => {
      const response = new Response(null, {
        status: 204,
        statusText: "No Content",
        headers: { etag: "abc" },
      });
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/metadata", "headers"));

      assertOk(result, response);
      assertEqual(result.value.status, 204);
      assertEqual(result.value.statusText, "No Content");
      assertEqual(result.value.headers.get("etag"), "abc");
    });

    it("does not judge status: non-2xx resolves with metadata", async () => {
      const response = new Response("denied", {
        status: 404,
        statusText: "Not Found",
      });
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/missing", "headers"));

      assertOk(result, response);
    });

    it("cancels the body before headers mode resolves", async () => {
      let wasCancelled = false;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          cancel: () => {
            wasCancelled = true;
          },
        }),
      );
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/body", "headers"));

      assertOk(result, response);
      assertTrue(wasCancelled);
    });

    it("a body cancel failure does not fail headers mode", async () => {
      const response = new Response(
        new ReadableStream<Uint8Array>({
          cancel: () => {
            throw new Error("cancel failed");
          },
        }),
      );
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/metadata", "headers"));

      assertOk(result, response);
    });
  });

  describe("consumer", () => {
    it("receives the Response and returns plain values", async () => {
      const response = new Response("hello", {
        status: 201,
        headers: { "cache-control": "max-age=60" },
      });
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(
        fetch("/metadata", (response) =>
          ok({
            status: response.status,
            cacheControl: response.headers.get("cache-control"),
          }),
        ),
      );

      assertOk(result, {
        status: 201,
        cacheControl: "max-age=60",
      });
    });

    it("keeps native status semantics: non-2xx resolves into the consumer", async () => {
      const response = new Response("denied", {
        status: 404,
        statusText: "Not Found",
      });
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(
        fetch("/missing", (response) =>
          ok({
            status: response.status,
            text: response.statusText,
          }),
        ),
      );

      assertOk(result, {
        status: 404,
        text: "Not Found",
      });
    });

    it("passes a returned Result error through unchanged", async () => {
      const testError = { type: "TestError" } as const;
      const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/domain-error", () => err(testError)));

      assertErr(result, testError);
    });

    it("a throw outside abort is a defect that panics the Run tree", async () => {
      const defect = new Error("consumer failed");
      const panicAbortError = createAbortError(createPanicAbortReason(defect));
      const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
      await using run = testCreateRun({ nativeFetch });

      await assertRejects(
        run(
          fetch("/defect", () => {
            throw defect;
          }),
        ),
        panicAbortError,
      );
      assertEqual(await run.deps.reportDefect.next(), panicAbortError);
    });

    it("an Ok returned after abort is kept", async () => {
      const consumerStarted = Promise.withResolvers<void>();
      const continueConsumer = Promise.withResolvers<void>();
      const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
      await using run = testCreateRun({ nativeFetch });

      const fiber = run.abortable(
        fetch("/abort", async () => {
          consumerStarted.resolve();
          await continueConsumer.promise;
          return ok("value");
        }),
      );

      await consumerStarted.promise;
      fiber.abort();
      continueConsumer.resolve();

      assertEqual(await fiber, ok("value"));
    });
  });

  describe("abort", () => {
    describe("Run AbortError", () => {
      it("rethrows signal.reason when a body read rejects with the Run AbortError", async () => {
        const bodyReadStarted = Promise.withResolvers<void>();
        const continueBodyRead = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch((_input, init) => {
          const signal = init?.signal;
          if (!signal) throw new Error("Missing signal");

          return Object.assign(new Response("hello"), {
            text: async () => {
              bodyReadStarted.resolve();
              await continueBodyRead.promise;
              throw signal.reason;
            },
          });
        });
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await bodyReadStarted.promise;
        fiber.abort(testAbortReason);
        continueBodyRead.resolve();

        assertEqual(await fiber, err(testAbortError));
      });

      it("run(fetch) rejects with AbortError when the request aborts before response", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Fetch can reject with Task's structured AbortError.
                  reject(init.signal?.reason);
                },
                { once: true },
              );
              nativeFetchStarted.resolve();
            }),
        );
        await using root = testCreateRun({ nativeFetch });
        await using run = root.create();

        const fiber = run(fetch("/abort", "text"));

        await nativeFetchStarted.promise;
        run.abort(testAbortReason);

        await assertRejects(fiber, testAbortError);
      });

      it("run.abortable returns AbortError as a Result error", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Fetch can reject with Task's structured AbortError.
                  reject(init.signal?.reason);
                },
                { once: true },
              );
              nativeFetchStarted.resolve();
            }),
        );
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await nativeFetchStarted.promise;
        fiber.abort(testAbortReason);

        assertEqual(await fiber, err(testAbortError));
      });

      it("a consumer is not invoked when abort precedes the response", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const responseDeferred = Promise.withResolvers<Response>();
        let wasConsumerInvoked = false;
        const nativeFetch = testCreateNativeFetch(() => {
          nativeFetchStarted.resolve();
          return responseDeferred.promise;
        });
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(
          fetch("/abort", () => {
            wasConsumerInvoked = true;
            return ok("value");
          }),
        );

        await nativeFetchStarted.promise;
        fiber.abort(testAbortReason);
        responseDeferred.resolve(new Response("hello"));

        assertEqual(await fiber, err(testAbortError));
        assertFalse(wasConsumerInvoked);
      });

      it("a response arriving after abort is cancelled and abort wins", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const responseDeferred = Promise.withResolvers<Response>();
        let wasCancelled = false;
        const nativeFetch = testCreateNativeFetch(() => {
          nativeFetchStarted.resolve();
          return responseDeferred.promise;
        });
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await nativeFetchStarted.promise;
        fiber.abort(testAbortReason);
        responseDeferred.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              cancel: () => {
                wasCancelled = true;
              },
            }),
          ),
        );

        assertEqual(await fiber, err(testAbortError));
        assertTrue(wasCancelled);
      });

      it("rethrows signal.reason from a status-body drain after abort", async () => {
        const bodyDrainStarted = Promise.withResolvers<void>();
        const continueBodyDrain = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch((_input, init) => {
          const signal = init?.signal;
          if (!signal) throw new Error("Missing signal");

          return Object.assign(new Response(null, { status: 500 }), {
            text: async () => {
              bodyDrainStarted.resolve();
              await continueBodyDrain.promise;
              throw signal.reason;
            },
          });
        });
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await bodyDrainStarted.promise;
        fiber.abort(testAbortReason);
        continueBodyDrain.resolve();

        assertEqual(await fiber, err(testAbortError));
      });

      it("rethrows signal.reason from headers-mode body cancel after abort", async () => {
        const bodyCancelStarted = Promise.withResolvers<void>();
        const continueBodyCancel = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch((_input, init) => {
          const signal = init?.signal;
          if (!signal) throw new Error("Missing signal");

          return new Response(
            new ReadableStream<Uint8Array>({
              cancel: async () => {
                bodyCancelStarted.resolve();
                await continueBodyCancel.promise;
                throw signal.reason;
              },
            }),
          );
        });
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "headers"));

        await bodyCancelStarted.promise;
        fiber.abort(testAbortReason);
        continueBodyCancel.resolve();

        assertEqual(await fiber, err(testAbortError));
      });

      it("rethrows the Run AbortError thrown by a consumer", async () => {
        const consumerStarted = Promise.withResolvers<void>();
        const continueConsumer = Promise.withResolvers<void>();
        let signal: AbortSignal | undefined;
        const nativeFetch = testCreateNativeFetch((_input, init) => {
          signal = init?.signal ?? undefined;
          return new Response("hello");
        });
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(
          fetch("/abort", async () => {
            consumerStarted.resolve();
            await continueConsumer.promise;
            if (!signal) throw new Error("Missing signal");
            throw signal.reason;
          }),
        );

        await consumerStarted.promise;
        fiber.abort(testAbortReason);
        continueConsumer.resolve();

        assertEqual(await fiber, err(testAbortError));
      });

      it("an aborted status-body drain becomes AbortError, not FetchStatusError", async () => {
        const bodyDrainStarted = Promise.withResolvers<void>();
        const continueBodyDrain = Promise.withResolvers<void>();
        const response = Object.assign(new Response(null, { status: 500 }), {
          text: async () => {
            bodyDrainStarted.resolve();
            await continueBodyDrain.promise;
            throw createHostAbortError();
          },
        });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await bodyDrainStarted.promise;
        fiber.abort(testAbortReason);
        continueBodyDrain.resolve();

        assertEqual(await fiber, err(testAbortError));
      });
    });

    describe("host abort normalization", () => {
      it("normalizes a host abort error from native fetch", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  reject(createHostAbortError());
                },
                { once: true },
              );
              nativeFetchStarted.resolve();
            }),
        );
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await nativeFetchStarted.promise;
        fiber.abort(testAbortReason);

        assertEqual(await fiber, err(testAbortError));
      });

      it("normalizes a host abort error from a mode body read", async () => {
        const bodyReadStarted = Promise.withResolvers<void>();
        const continueBodyRead = Promise.withResolvers<void>();
        const response = Object.assign(new Response("hello"), {
          text: async () => {
            bodyReadStarted.resolve();
            await continueBodyRead.promise;
            throw createHostAbortError();
          },
        });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "text"));

        await bodyReadStarted.promise;
        fiber.abort(testAbortReason);
        continueBodyRead.resolve();

        assertEqual(await fiber, err(testAbortError));
      });

      it("normalizes a host abort error from a headers-mode body cancel", async () => {
        const bodyCancelStarted = Promise.withResolvers<void>();
        const continueBodyCancel = Promise.withResolvers<void>();
        const response = new Response(
          new ReadableStream<Uint8Array>({
            cancel: async () => {
              bodyCancelStarted.resolve();
              await continueBodyCancel.promise;
              throw createHostAbortError();
            },
          }),
        );
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(fetch("/abort", "headers"));

        await bodyCancelStarted.promise;
        fiber.abort(testAbortReason);
        continueBodyCancel.resolve();

        assertEqual(await fiber, err(testAbortError));
      });

      it("normalizes a host abort error thrown by a consumer", async () => {
        const consumerStarted = Promise.withResolvers<void>();
        const continueConsumer = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(
          fetch("/abort", async () => {
            consumerStarted.resolve();
            await continueConsumer.promise;
            throw createHostAbortError();
          }),
        );

        await consumerStarted.promise;
        fiber.abort(testAbortReason);
        continueConsumer.resolve();

        assertEqual(await fiber, err(testAbortError));
      });
    });

    describe("consumer after abort", () => {
      it("an Err returned by a consumer after abort becomes AbortError", async () => {
        const testError = { type: "TestError" } as const;
        const consumerStarted = Promise.withResolvers<void>();
        const continueConsumer = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
        await using run = testCreateRun({ nativeFetch });

        const fiber = run.abortable(
          fetch("/abort", async () => {
            consumerStarted.resolve();
            await continueConsumer.promise;
            return err(testError);
          }),
        );

        await consumerStarted.promise;
        fiber.abort(testAbortReason);
        continueConsumer.resolve();

        assertEqual(await fiber, err(testAbortError));
      });
    });
  });
});

const createHostAbortError = (): Error => {
  const error = new Error("Fetch is aborted");
  error.name = "AbortError";
  return error;
};
