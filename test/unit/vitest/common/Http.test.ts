import { expectErr, expectOk } from "@evolu/vitest";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  fetch,
  testCreateNativeFetchErroringBody,
  testCreateNativeFetch,
  type FetchError,
  type FetchResponse,
  type FetchTransportError,
} from "../../../../packages/common/src/Http.ts";
import {
  err,
  ok,
  type Result,
} from "../../../../packages/common/src/Result.ts";
import {
  createAbortError,
  createPanicAbortReason,
  testAbortError,
  testAbortReason,
  testCreateRun,
  type Task,
} from "../../../../packages/common/src/Task.ts";

describe("fetch", () => {
  test("uses deps.nativeFetch with init and the Task Run signal", async () => {
    const headers = new Headers({ accept: "text/plain" });
    const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/hello", "text", { headers }));

    expectOk(result, "hello");
    expect(nativeFetch.calls).toEqual([
      {
        input: "/hello",
        init: { headers, signal: expect.any(AbortSignal) },
      },
    ]);
  });

  test("returns FetchTransportError when the test default nativeFetch is not replaced", async () => {
    await using run = testCreateRun();

    const result = await run(fetch("/missing-test-double", "text"));

    expectErr(result, {
      type: "FetchTransportError",
      error: new Error("Provide a nativeFetch test double"),
    });
  });

  test("returns FetchTransportError when test nativeFetch has no queued handler", async () => {
    const nativeFetch = testCreateNativeFetch();
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/unexpected", "text"));

    expectErr(result, {
      type: "FetchTransportError",
      error: new Error("Unexpected NativeFetch call"),
    });
  });

  test("test nativeFetch queues handlers after creation", async () => {
    const nativeFetch = testCreateNativeFetch();
    nativeFetch.handle(() => new Response("hello"));
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/queued", "text"));

    expectOk(result, "hello");
  });

  test("returns FetchTransportError when nativeFetch rejects asynchronously", async () => {
    const failure = new Error("network failed");
    const nativeFetch = testCreateNativeFetch(() => Promise.reject(failure));
    await using run = testCreateRun({ nativeFetch });

    const result = await run(fetch("/network-failure", "text"));

    expectErr(result, {
      type: "FetchTransportError",
      error: failure,
    });
  });

  test("infers overload result types", () => {
    interface TestError {
      readonly type: "TestError";
    }

    expectTypeOf(fetch("/text", "text")).toEqualTypeOf<
      Task<string, FetchError>
    >();
    expectTypeOf(fetch("/json", "json")).toEqualTypeOf<
      Task<unknown, FetchError>
    >();
    expectTypeOf(fetch("/bytes", "bytes")).toEqualTypeOf<
      Task<Uint8Array<ArrayBuffer>, FetchError>
    >();
    expectTypeOf(fetch("/headers", "headers")).toEqualTypeOf<
      Task<FetchResponse, FetchTransportError>
    >();
    expectTypeOf(fetch("/consumer", () => ok("value"))).toEqualTypeOf<
      Task<string, FetchTransportError>
    >();
    expectTypeOf(
      fetch("/consumer-error", (): Result<string, TestError> =>
        err({ type: "TestError" }),
      ),
    ).toEqualTypeOf<Task<string, FetchTransportError | TestError>>();
  });

  describe("body modes", () => {
    describe("2xx response returns", () => {
      test("text as string", async () => {
        const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/hello", "text"));

        expectOk(result, "hello");
      });

      test("json as unknown", async () => {
        const nativeFetch = testCreateNativeFetch(
          () => new Response('{"name":"Ada"}'),
        );
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/user", "json"));

        expectOk(result, { name: "Ada" });
      });

      test("bytes as Uint8Array", async () => {
        const nativeFetch = testCreateNativeFetch(
          () => new Response(new Uint8Array([1, 2, 3])),
        );
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/bytes", "bytes"));

        expectOk(result, new Uint8Array([1, 2, 3]));
      });
    });

    describe("non-2xx response returns FetchStatusError", () => {
      test("drains body as text", async () => {
        const response = new Response("denied", {
          status: 404,
          statusText: "Not Found",
        });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/missing", "text"));

        expectErr(result, {
          type: "FetchStatusError",
          response,
          body: ok("denied"),
        });
      });

      test("json does not attempt JSON parsing", async () => {
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

        expectErr(result, {
          type: "FetchStatusError",
          response,
          body: ok("denied"),
        });
      });

      test("stores body read error from text drain", async () => {
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

        expectErr(result, {
          type: "FetchStatusError",
          response,
          body: err(failure),
        });
      });
    });

    describe("2xx response returns FetchBodyError for", () => {
      test("text body read failure", async () => {
        const failure = new Error("stream failed");
        const response = new Response(
          testCreateNativeFetchErroringBody(failure),
        );
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/broken", "text"));

        expectErr(result, {
          type: "FetchBodyError",
          response,
          error: expect.any(Error),
        });
      });

      test("json invalid JSON", async () => {
        const response = new Response("not json");
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/invalid", "json"));

        expectErr(result, {
          type: "FetchBodyError",
          response,
          // WebKit does not report the parse failure as SyntaxError.
          error: expect.any(Error),
        });
      });

      test("json empty body such as 204", async () => {
        const response = new Response(null, { status: 204 });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/empty", "json"));

        expectErr(result, {
          type: "FetchBodyError",
          response,
          // WebKit does not report the parse failure as SyntaxError.
          error: expect.any(Error),
        });
      });

      test("bytes body read failure", async () => {
        const failure = new Error("stream failed");
        const response = Object.assign(new Response(), {
          bytes: () => Promise.reject(failure),
        });
        const nativeFetch = testCreateNativeFetch(() => response);
        await using run = testCreateRun({ nativeFetch });

        const result = await run(fetch("/broken", "bytes"));

        expectErr(result, {
          type: "FetchBodyError",
          response,
          error: failure,
        });
      });
    });
  });

  describe("headers mode", () => {
    test("returns plain response metadata", async () => {
      const response = new Response(null, {
        status: 204,
        statusText: "No Content",
        headers: { etag: "abc" },
      });
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/metadata", "headers"));

      expectOk(result, response);
      expect(result.value.status).toBe(204);
      expect(result.value.statusText).toBe("No Content");
      expect(result.value.headers.get("etag")).toBe("abc");
    });

    test("does not judge status: non-2xx resolves with metadata", async () => {
      const response = new Response("denied", {
        status: 404,
        statusText: "Not Found",
      });
      const nativeFetch = testCreateNativeFetch(() => response);
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/missing", "headers"));

      expectOk(result, response);
    });

    test("cancels the body before headers mode resolves", async () => {
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

      expectOk(result, response);
      expect(wasCancelled).toBe(true);
    });

    test("a body cancel failure does not fail headers mode", async () => {
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

      expectOk(result, response);
    });
  });

  describe("consumer", () => {
    test("receives the Response and returns plain values", async () => {
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

      expectOk(result, {
        status: 201,
        cacheControl: "max-age=60",
      });
    });

    test("keeps native status semantics: non-2xx resolves into the consumer", async () => {
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

      expectOk(result, {
        status: 404,
        text: "Not Found",
      });
    });

    test("passes a returned Result error through unchanged", async () => {
      const testError = { type: "TestError" } as const;
      const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
      await using run = testCreateRun({ nativeFetch });

      const result = await run(fetch("/domain-error", () => err(testError)));

      expectErr(result, testError);
    });

    test("a throw outside abort is a defect that panics the Run tree", async () => {
      const defect = new Error("consumer failed");
      const panicAbortError = createAbortError(createPanicAbortReason(defect));
      const nativeFetch = testCreateNativeFetch(() => new Response("hello"));
      await using run = testCreateRun({ nativeFetch });

      await expect(
        run(
          fetch("/defect", () => {
            throw defect;
          }),
        ),
      ).rejects.toEqual(panicAbortError);
      expect(await run.deps.reportDefect.next()).toEqual(panicAbortError);
    });

    test("an Ok returned after abort is kept", async () => {
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

      expect(await fiber).toEqual(ok("value"));
    });
  });

  describe("abort", () => {
    describe("Run AbortError", () => {
      test("rethrows signal.reason when a body read rejects with the Run AbortError", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("run(fetch) rejects with AbortError when the request aborts before response", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Fetch can reject with Task's structured AbortError.
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

        await expect(fiber).rejects.toEqual(testAbortError);
      });

      test("run.abortable returns AbortError as a Result error", async () => {
        const nativeFetchStarted = Promise.withResolvers<void>();
        const nativeFetch = testCreateNativeFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Fetch can reject with Task's structured AbortError.
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("a consumer is not invoked when abort precedes the response", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
        expect(wasConsumerInvoked).toBe(false);
      });

      test("a response arriving after abort is cancelled and abort wins", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
        expect(wasCancelled).toBe(true);
      });

      test("rethrows signal.reason from a status-body drain after abort", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("rethrows signal.reason from headers-mode body cancel after abort", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("rethrows the Run AbortError thrown by a consumer", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("an aborted status-body drain becomes AbortError, not FetchStatusError", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });
    });

    describe("host abort normalization", () => {
      test("normalizes a host abort error from native fetch", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("normalizes a host abort error from a mode body read", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("normalizes a host abort error from a headers-mode body cancel", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });

      test("normalizes a host abort error thrown by a consumer", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });
    });

    describe("consumer after abort", () => {
      test("an Err returned by a consumer after abort becomes AbortError", async () => {
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

        expect(await fiber).toEqual(err(testAbortError));
      });
    });
  });
});

const createHostAbortError = (): Error => {
  const error = new Error("Fetch is aborted");
  error.name = "AbortError";
  return error;
};
