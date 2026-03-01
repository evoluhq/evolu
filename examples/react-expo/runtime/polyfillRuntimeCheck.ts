export interface RuntimeCheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly details: string;
}

export const runAbortPolyfillRuntimeChecks = async (): Promise<
  ReadonlyArray<RuntimeCheckResult>
> => {
  const checks = [
    checkAbortReasonPropagation,
    checkAbortDefaultReason,
    checkAbortSignalAbortStatic,
    checkAbortSignalAnyPrefersFirstAborted,
    checkAbortSignalTimeout,
  ] as const;

  const results: Array<RuntimeCheckResult> = [];

  for (const check of checks) {
    results.push(await runCheck(check));
  }

  return results;
};

const runCheck = async (
  check: () => RuntimeCheckResult | Promise<RuntimeCheckResult>,
): Promise<RuntimeCheckResult> => {
  try {
    return await check();
  } catch (error) {
    return {
      name: check.name,
      ok: false,
      details: getErrorMessage(error),
    };
  }
};

const checkAbortReasonPropagation = (): RuntimeCheckResult => {
  const reason = new Error("manual-reason");
  const controller = new AbortController();
  controller.abort(reason);

  ensure(controller.signal.aborted, "signal should be aborted");
  ensure(
    (controller.signal as { readonly reason: unknown }).reason === reason,
    "signal.reason should equal provided reason",
  );

  return ok("abort reason propagation", "signal.reason preserved");
};

const checkAbortDefaultReason = (): RuntimeCheckResult => {
  const controller = new AbortController();
  controller.abort();

  const reason = (controller.signal as { readonly reason: unknown }).reason;
  ensure(controller.signal.aborted, "signal should be aborted");
  ensure(reason instanceof Error, "default reason should be Error-like");
  ensure(
    (reason as Error).name === "AbortError",
    "default reason should use AbortError name",
  );

  return ok(
    "abort default reason",
    "AbortError is created when reason is omitted",
  );
};

const checkAbortSignalAbortStatic = (): RuntimeCheckResult => {
  ensure(typeof AbortSignal.abort === "function", "AbortSignal.abort missing");

  const reason = { marker: "manual" };
  const signal = AbortSignal.abort(reason);

  ensure(signal.aborted, "AbortSignal.abort should return aborted signal");
  ensure(
    (signal as { readonly reason: unknown }).reason === reason,
    "AbortSignal.abort should preserve reason",
  );

  return ok("AbortSignal.abort", "static abort exists and keeps reason");
};

const checkAbortSignalAnyPrefersFirstAborted = (): RuntimeCheckResult => {
  ensure(typeof AbortSignal.any === "function", "AbortSignal.any missing");

  const first = new AbortController();
  const second = new AbortController();

  const firstReason = { marker: "first" };
  const secondReason = { marker: "second" };

  first.abort(firstReason);
  second.abort(secondReason);

  const signal = AbortSignal.any([first.signal, second.signal]);

  ensure(signal.aborted, "AbortSignal.any should return aborted signal");
  ensure(
    (signal as { readonly reason: unknown }).reason === firstReason,
    "AbortSignal.any should use first aborted signal in input order",
  );

  return ok("AbortSignal.any order", "first pre-aborted signal wins");
};

const checkAbortSignalTimeout = async (): Promise<RuntimeCheckResult> => {
  ensure(
    typeof AbortSignal.timeout === "function",
    "AbortSignal.timeout missing",
  );

  const signal = AbortSignal.timeout(1);
  await sleep(5);

  ensure(signal.aborted, "AbortSignal.timeout should abort signal");
  const reason = (signal as { readonly reason: unknown }).reason;
  ensure(reason instanceof Error, "timeout reason should be Error-like");
  ensure(
    (reason as Error).name === "TimeoutError",
    "timeout reason should use TimeoutError name",
  );

  return ok("AbortSignal.timeout", "timeout aborts with TimeoutError");
};

const ok = (name: string, details: string): RuntimeCheckResult => ({
  name,
  ok: true,
  details,
});

const ensure = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};
