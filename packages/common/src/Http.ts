/**
 * Task-aware HTTP helpers.
 *
 * @module
 */

import { err, ok, tryAsync, type Err, type Result } from "./Result.ts";
import type { AbortError, retry, Task, timeout } from "./Task.ts";
import type { Typed } from "./Type.ts";
import type { Awaitable } from "./Types.ts";

/**
 * WHATWG-fetch-compatible function used by {@link fetch}.
 *
 * A default dependency, replaceable at the composition root — for a
 * platform-optimized fetch such as React Native's, a configured undici
 * instance, or a test double. Implementations must be pre-bound; unbound
 * `globalThis.fetch` throws in browsers.
 *
 * @group Fetch
 */
export type NativeFetch = typeof globalThis.fetch;

/**
 * Dependency wrapper for {@link NativeFetch}.
 *
 * @group Fetch
 */
export interface NativeFetchDep {
  readonly nativeFetch: NativeFetch;
}

/**
 * Body mode for {@link fetch}.
 *
 * A mode selects a built-in consumer that reads the {@link Response} inside the
 * fetch Task:
 *
 * - `"bytes"` — reads the body as a `Uint8Array<ArrayBuffer>`.
 * - `"headers"` — cancels the body and returns {@link FetchResponse}. Pair it with
 *   `{ method: "HEAD" }` when the server should not send a body.
 * - `"json"` — parses the body as JSON and returns `unknown`. Narrow or decode at
 *   the call site; there is deliberately no generic to cast through.
 * - `"text"` — reads the body as a string.
 *
 * Body modes (`"bytes"`, `"json"`, `"text"`) return {@link FetchStatusError} for
 * non-2xx responses. `"headers"` does not judge status, because the status is
 * usually the value being asked for.
 *
 * @group Fetch
 */
export type FetchMode = "text" | "json" | "bytes" | "headers";

/**
 * Body-free {@link Response} view safe to return from {@link fetch}.
 *
 * {@link fetch} returns this view only after the native body has been drained,
 * errored, or cancelled, so none of its usable members depends on the request
 * signal. Body-reading members and `Response.clone` are omitted because they
 * would be invalid after the fetch Task settles.
 *
 * This is a TypeScript contract, not a runtime security boundary: the runtime
 * value can still be a native Response, and casts can access omitted members.
 *
 * @group Fetch
 */
export type FetchResponse = Omit<
  Response,
  | "arrayBuffer"
  | "blob"
  | "body"
  | "bodyUsed"
  | "bytes"
  | "clone"
  | "formData"
  | "json"
  | "text"
>;

/**
 * Error returned by {@link fetch} body modes.
 *
 * The union distinguishes native request failures, non-2xx responses, and body
 * read failures. Narrow on `type` when handling a specific case. The
 * distinction matters for retries: {@link FetchBodyError} means a 2xx response
 * failed during reading, so the server may have committed the request.
 *
 * @group Fetch
 */
export type FetchError =
  FetchTransportError | FetchStatusError | FetchBodyError;

/**
 * Error returned when the native fetch request fails before a response exists.
 *
 * @group Fetch
 */
export interface FetchTransportError extends Typed<"FetchTransportError"> {
  readonly error: unknown;
}

/**
 * Error returned when a body mode receives a non-2xx response.
 *
 * The response body is drained as text before this error is returned. Draining
 * buffers the whole error body; error responses are expected to be small. If
 * the drain itself fails, `body` contains the read error.
 *
 * @group Fetch
 */
export interface FetchStatusError extends Typed<"FetchStatusError"> {
  readonly response: FetchResponse;
  readonly body: Result<string, unknown>;
}

/**
 * Error returned when a body mode cannot read or decode a 2xx response.
 *
 * This includes mid-stream network failures, decoding failures, and — for the
 * `"json"` mode — empty bodies such as 204 responses, which are not JSON. Do
 * not use `"json"` for endpoints that return no content.
 *
 * @group Fetch
 */
export interface FetchBodyError extends Typed<"FetchBodyError"> {
  readonly response: FetchResponse;
  readonly error: unknown;
}

/**
 * Consumes a native {@link Response} before {@link fetch} settles.
 *
 * The callback runs inside the fetch Task, while the request signal is still
 * alive. Return a Result error for expected domain failures. Throwing or
 * rejecting with a non-abort error is a defect, like any other Task body.
 *
 * Consumers take values, not dependencies; close over anything they need. A
 * consumer that needs its own timeout, retries, or child Tasks has outgrown
 * being a consumer: fetch the body with a mode and compose Tasks on the plain
 * value, or write a Task that owns the whole request.
 *
 * Consumers do not have to normalize abort. {@link fetch} rethrows Evolu
 * {@link AbortError}, normalizes host abort errors after the Run aborts, and
 * treats an Err returned after abort as abort control flow — so a consumer's
 * `try`/`catch` around a body read cannot accidentally turn an abort into a
 * domain error. An Ok returned after abort is kept; only errors are presumed to
 * be abort in disguise.
 *
 * The Response and anything derived from its live body, such as a reader, must
 * not escape the consumer. Consume to plain values before returning.
 *
 * @group Fetch
 */
export type FetchConsume<T, E = never> = (
  response: Response,
) => Awaitable<Result<T, E>>;

/**
 * Fetches a resource and consumes the {@link Response} inside the Task, so the
 * body is read while the request signal is still alive.
 *
 * The request runs through {@link NativeFetchDep | run.deps.nativeFetch}.
 * Because native fetch is a default dependency, platforms and tests can replace
 * it without changing call sites.
 *
 * With a {@link FetchMode}, non-2xx responses return {@link FetchStatusError}
 * (except `"headers"`, which reports status as a value) and unreadable bodies
 * return {@link FetchBodyError}. With a {@link FetchConsume} callback, native
 * status semantics apply: HTTP error statuses resolve, and the consumer decides
 * how to interpret the status and body.
 *
 * `signal` is not accepted in init because abort is controlled by the current
 * Run.
 *
 * Aborting the Run aborts the underlying request, any response that arrives
 * after abort, and any in-progress body read. Abort is represented as
 * {@link AbortError}, not FetchError: `run(fetch(...))` rejects with AbortError,
 * and `run.abortable(fetch(...))` returns it as an {@link Err}.
 *
 * Some runtimes reject aborted fetches with their own error instead of
 * `signal.reason`. This wrapper normalizes abort rejections from native fetch,
 * built-in body reads, and consumer callbacks back to the Run's AbortError.
 *
 * `fetch` owns request lifetime and Response containment. It does not transform
 * requests or interpret app protocols beyond the built-in modes. Use Task
 * helpers for resilience, app helpers for app conventions, a replacement
 * {@link NativeFetch} for request-wide behavior (base URLs, auth, logging), and
 * consumers for response interpretation.
 *
 * ### Composing fetch
 *
 * Resilience is ordinary Task composition: wrap `fetch(url, "json")` in
 * {@link timeout}, then in {@link retry}.
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertOk,
 *   assertType,
 *   createRun,
 *   Data,
 *   exponential,
 *   fetch,
 *   retry,
 *   take,
 *   timeout,
 *   type NativeFetch,
 * } from "@evolu/common";
 *
 * const fetchWithRetry = (url: string) =>
 *   retry(
 *     timeout(fetch(url, "json"), "30s"),
 *     take(2)(exponential("100ms")),
 *   );
 *
 * let requestCount = 0;
 * const nativeFetch: NativeFetch = () => {
 *   requestCount++;
 *   return Promise.resolve(
 *     requestCount === 1
 *       ? new Response("Try again", { status: 503 })
 *       : new Response('{"name":"Ada"}'),
 *   );
 * };
 * await using run = createRun({ nativeFetch });
 *
 * const result = await run(fetchWithRetry("/api/user"));
 * assertOk(result);
 * assertType(Data, result.value);
 * assertEqual(result.value, { name: "Ada" });
 * ```
 *
 * App conventions belong in small app-owned helpers. For example, posting JSON
 * is native `init` plus two conventions worth centralizing — the content-type
 * header and the stringify:
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertOk,
 *   assertType,
 *   createRun,
 *   Data,
 *   fetch,
 *   type FetchError,
 *   type NativeFetch,
 *   type Task,
 * } from "@evolu/common";
 *
 * const postJson = (
 *   url: string,
 *   data: unknown,
 * ): Task<unknown, FetchError> =>
 *   fetch(url, "json", {
 *     method: "POST",
 *     headers: { "content-type": "application/json" },
 *     body: JSON.stringify(data),
 *   });
 *
 * const nativeFetch: NativeFetch = () =>
 *   Promise.resolve(new Response('{"id":"user-1"}'));
 * await using run = createRun({ nativeFetch });
 *
 * const result = await run(postJson("/api/users", { name: "Ada" }));
 * assertOk(result);
 * assertType(Data, result.value);
 * assertEqual(result.value, { id: "user-1" });
 * ```
 *
 * Your app's version will grow your conventions — auth, envelopes, error
 * mapping — which is why it belongs to the app, not to `fetch`.
 *
 * ### Intercepting requests
 *
 * Request-wide behavior belongs to a replacement {@link NativeFetch} installed
 * at the composition root. This is the equivalent of interceptors or hooks in
 * libraries that expose client instances.
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertOk,
 *   createRun,
 *   fetch,
 *   type NativeFetch,
 * } from "@evolu/common";
 *
 * const token = "secret-token";
 * const baseUrl = "https://api.example.com/v1/";
 * let interceptedRequest: Request | undefined;
 * const baseFetch: NativeFetch = (input, init) => {
 *   interceptedRequest = new Request(input, init);
 *   return Promise.resolve(new Response("ok"));
 * };
 *
 * const nativeFetch: NativeFetch = (input, init) => {
 *   const headers = new Headers(init?.headers);
 *   headers.set("authorization", `Bearer ${token}`);
 *
 *   // Only string inputs are resolved against the base URL; URL and Request
 *   // inputs are passed through unchanged.
 *   const url =
 *     typeof input === "string" ? new URL(input, baseUrl) : input;
 *   return baseFetch(url, { ...init, headers });
 * };
 *
 * await using run = createRun({ nativeFetch });
 * assertOk(await run(fetch("users", "text")), "ok");
 * assertEqual(
 *   {
 *     url: interceptedRequest?.url,
 *     authorization: interceptedRequest?.headers.get("authorization"),
 *   },
 *   {
 *     url: "https://api.example.com/v1/users",
 *     authorization: "Bearer secret-token",
 *   },
 * );
 * ```
 *
 * ### Consuming responses
 *
 * Built-in modes handle common bodies. Specialized response interpretation
 * belongs in a consumer. Typed decoders, response envelopes, streaming, and
 * custom status semantics can be built on top without changing `fetch`.
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertOk,
 *   assertType,
 *   createRun,
 *   Data,
 *   fetch,
 *   ok,
 *   type FetchTransportError,
 *   type NativeFetch,
 *   type Task,
 * } from "@evolu/common";
 *
 * const nativeFetch: NativeFetch = (input) =>
 *   Promise.resolve(
 *     String(input).endsWith("/metadata")
 *       ? new Response(null, {
 *           status: 204,
 *           headers: { "cache-control": "max-age=60" },
 *         })
 *       : new Response('{"name":"Ada"}'),
 *   );
 * await using run = createRun({ nativeFetch });
 *
 * const user = await run(fetch("/api/user", "json"));
 * const metadata = fetch("/api/user/metadata", (response) =>
 *   ok({
 *     status: response.status,
 *     cache: response.headers.get("cache-control"),
 *   }),
 * );
 * assertType<
 *   Task<{ status: number; cache: string | null }, FetchTransportError>,
 *   typeof metadata
 * >();
 * assertOk(user);
 * assertType(Data, user.value);
 * assertEqual(user.value, { name: "Ada" });
 * assertOk(await run(metadata), { status: 204, cache: "max-age=60" });
 * ```
 *
 * ### Aborting fetch
 *
 * Abort follows the standard Task rules: a Fiber from `run(fetch(...))` rejects
 * with {@link AbortError}, and `run.abortable(fetch(...))` returns it as a
 * Result error.
 *
 * ```ts
 * import {
 *   assert,
 *   AbortError,
 *   createRun,
 *   fetch,
 *   type NativeFetch,
 * } from "@evolu/common";
 *
 * const nativeFetch: NativeFetch = (_input, init) =>
 *   new Promise<Response>((_resolve, reject) => {
 *     const signal = init?.signal;
 *     if (!signal) throw new Error("Missing signal");
 *     signal.addEventListener("abort", () => reject(signal.reason), {
 *       once: true,
 *     });
 *   });
 * await using run = createRun({ nativeFetch });
 *
 * const fiber = run.abortable(fetch("/api/user", "json"));
 * fiber.abort();
 * const result = await fiber;
 *
 * assert(
 *   !result.ok && AbortError.is(result.error),
 *   "Expected an AbortError.",
 * );
 * ```
 *
 * @group Fetch
 */
export function fetch(
  input: RequestInfo | URL,
  mode: "text",
  init?: Omit<RequestInit, "signal">,
): Task<string, FetchError>;

/** Fetches a resource and parses a successful response body as JSON. */
export function fetch(
  input: RequestInfo | URL,
  mode: "json",
  init?: Omit<RequestInit, "signal">,
): Task<unknown, FetchError>;

/** Fetches a resource and reads a successful response body as bytes. */
export function fetch(
  input: RequestInfo | URL,
  mode: "bytes",
  init?: Omit<RequestInit, "signal">,
): Task<Uint8Array<ArrayBuffer>, FetchError>;

/**
 * Fetches a resource and returns its body-free response metadata.
 *
 * HTTP status is returned as data rather than interpreted as success or
 * failure.
 */
export function fetch(
  input: RequestInfo | URL,
  mode: "headers",
  init?: Omit<RequestInit, "signal">,
): Task<FetchResponse, FetchTransportError>;

/** Fetches a resource and consumes its response with a custom callback. */
export function fetch<T, E = never>(
  input: RequestInfo | URL,
  consume: FetchConsume<T, E>,
  init?: Omit<RequestInit, "signal">,
): Task<T, FetchTransportError | E>;

export function fetch(
  input: RequestInfo | URL,
  modeOrConsume: FetchMode | FetchConsume<unknown, unknown>,
  init?: Omit<RequestInit, "signal">,
): Task<unknown, unknown> {
  return async (run) => {
    const { signal } = run;

    // Abort control flow wins over step errors, normalizing host abort errors
    // from native fetch, body reads, body cancel, and consumers.
    const orAbort = (error: unknown): unknown => {
      signal.throwIfAborted();
      return error;
    };

    const fetched = await tryAsync(
      () => run.deps.nativeFetch(input, { ...init, signal }),
      orAbort,
    );
    let result: Result<unknown, unknown>;

    if (!fetched.ok) {
      result = err({ type: "FetchTransportError", error: fetched.error });
    } else {
      const response = fetched.value;

      // A response that arrives after abort is not processed: cancel its body
      // best-effort, then let abort win before any mode or consumer runs.
      if (signal.aborted) {
        await tryAsync(() => response.body?.cancel());
        signal.throwIfAborted();
      }

      if (typeof modeOrConsume === "function") {
        const consumed = await tryAsync(() => modeOrConsume(response), orAbort);
        // A consumer throw is a defect once orAbort has ruled out abort.
        if (!consumed.ok) throw consumed.error;
        result = consumed.value;
      } else if (modeOrConsume === "headers") {
        // The head is already a value; body cancel failures are irrelevant.
        await tryAsync(() => response.body?.cancel(), orAbort);
        result = ok(response);
      } else if (!response.ok) {
        result = err({
          type: "FetchStatusError",
          response,
          // Error bodies are diagnostics; text preserves proxy/HTML/plain responses across modes.
          body: await tryAsync(() => response.text(), orAbort),
        });
      } else {
        const body = await tryAsync(() => {
          switch (modeOrConsume) {
            case "text":
              return response.text();
            case "json":
              return response.json() as Promise<unknown>;
            case "bytes":
              return response.bytes();
          }
        }, orAbort);
        result = body.ok
          ? body
          : err({ type: "FetchBodyError", response, error: body.error });
      }
    }

    // An Err produced after abort is treated as abort control flow.
    if (!result.ok) signal.throwIfAborted();
    return result;
  };
}

/**
 * Test {@link NativeFetch} that records calls and serves queued handlers.
 *
 * Each call shifts the next handler. Calling with an empty queue throws, so a
 * test never silently reaches an unplanned request.
 *
 * @group Testing
 */
export interface TestNativeFetch extends NativeFetch {
  readonly calls: ReadonlyArray<TestNativeFetchCall>;
  readonly handle: (handler: TestNativeFetchHandler) => void;
}

/**
 * Recorded {@link TestNativeFetch} call.
 *
 * @group Testing
 */
export interface TestNativeFetchCall {
  readonly input: RequestInfo | URL;
  readonly init: RequestInit | undefined;
}

/**
 * Handler for one {@link TestNativeFetch} call.
 *
 * @group Testing
 */
export type TestNativeFetchHandler = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
) => Awaitable<Response>;

/**
 * Creates {@link TestNativeFetch}.
 *
 * @group Testing
 */
export const testCreateNativeFetch = (
  ...handlers: ReadonlyArray<TestNativeFetchHandler>
): TestNativeFetch => {
  const calls: Array<TestNativeFetchCall> = [];
  const handlerQueue = [...handlers];

  return Object.assign(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ input, init });
      const handler = handlerQueue.shift();
      if (!handler) throw new Error("Unexpected NativeFetch call");
      return Promise.resolve(handler(input, init));
    },
    {
      calls,
      handle: (handler: TestNativeFetchHandler): void => {
        handlerQueue.push(handler);
      },
    },
  );
};

/**
 * Creates a Response body for {@link NativeFetch} tests that errors on first
 * read.
 *
 * @group Testing
 */
export const testCreateNativeFetchErroringBody = (
  error: unknown = new Error("stream failed"),
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    pull: (controller) => {
      controller.error(error);
    },
  });
