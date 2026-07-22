import { describe, expect, test } from "vitest";
import {
  isHermes,
  isServer,
} from "../../../../packages/common/src/Platform.ts";
import { parseStackTrace } from "../../../../packages/common/src/StackTrace.ts";

type JsEngine = "v8" | "spidermonkey" | "jsc" | "hermes";

const jsEngine: Promise<JsEngine> = isHermes
  ? Promise.resolve("hermes")
  : isServer
    ? Promise.resolve("v8")
    : import("vitest/browser").then(({ server }) =>
        server.browser === "chromium"
          ? "v8"
          : server.browser === "firefox"
            ? "spidermonkey"
            : "jsc",
      );

describe("parseStackTrace", () => {
  test("parses V8 async stack frames", () => {
    const stack = [
      "Error: boom",
      "    at async childTask (http://localhost:63315/src/Task.test.ts?t=123:10:2#hash)",
      "    at http://localhost:63315/src/Task.ts:11:3",
    ].join("\n");

    expect(parseStackTrace(stack).frames).toEqual([
      {
        columnNumber: 2,
        lineNumber: 10,
        location: "http://localhost:63315/src/Task.test.ts?t=123:10:2#hash",
        name: "childTask",
        sourceName: "Task.test.ts",
      },
      {
        columnNumber: 3,
        lineNumber: 11,
        location: "http://localhost:63315/src/Task.ts:11:3",
        name: undefined,
        sourceName: "Task.ts",
      },
    ]);
  });

  test("parses SpiderMonkey async stack frames", () => {
    const stack = [
      "eachChildDefectTask@http://localhost:63315/src/Task.test.ts:6280:17",
      "async*each/<@http://localhost:63315/src/Task.ts?t=123:3440:28",
      "createRunInternal/run.abortable@http://localhost:63315/src/Task.ts#hash:2149:19",
    ].join("\n");

    expect(parseStackTrace(stack).frames).toEqual([
      {
        columnNumber: 17,
        lineNumber: 6280,
        location: "http://localhost:63315/src/Task.test.ts:6280:17",
        name: "eachChildDefectTask",
        sourceName: "Task.test.ts",
      },
      {
        columnNumber: 28,
        lineNumber: 3440,
        location: "http://localhost:63315/src/Task.ts?t=123:3440:28",
        name: "each",
        sourceName: "Task.ts",
      },
      {
        columnNumber: 19,
        lineNumber: 2149,
        location: "http://localhost:63315/src/Task.ts#hash:2149:19",
        name: "createRunInternal/run.abortable",
        sourceName: "Task.ts",
      },
    ]);
  });

  test("normalizes SpiderMonkey anonymous closure frame names", () => {
    const stack = [
      "withFixtures/<@http://localhost:63315/chunk-artifact.js:1:2",
      "runTest/</</<@http://localhost:63315/chunk-artifact.js:3:4",
      "withCancel/runWithCancel/<@http://localhost:63315/chunk-artifact.js:5:6",
    ].join("\n");

    expect(parseStackTrace(stack).frames.map(({ name }) => name)).toEqual([
      "withFixtures",
      "runTest",
      "withCancel/runWithCancel",
    ]);
  });

  test("parses anonymous stack frames", () => {
    const stack = [
      "@http://localhost:63315/src/Task.test.ts:1:2",
      "http://localhost:63315/src/Task.ts:3:4",
    ].join("\n");

    expect(parseStackTrace(stack).frames).toEqual([
      {
        columnNumber: 2,
        lineNumber: 1,
        location: "http://localhost:63315/src/Task.test.ts:1:2",
        name: undefined,
        sourceName: "Task.test.ts",
      },
      {
        columnNumber: 4,
        lineNumber: 3,
        location: "http://localhost:63315/src/Task.ts:3:4",
        name: undefined,
        sourceName: "Task.ts",
      },
    ]);
  });

  test("returns frame names", () => {
    const stack = [
      "named@http://localhost:63315/src/Task.test.ts:1:2",
      "@http://localhost:63315/src/Task.ts:3:4",
    ].join("\n");

    expect(parseStackTrace(stack).names).toEqual(["named"]);
  });

  test("returns source names", () => {
    const stack = [
      "named@http://localhost:63315/src/Task.test.ts?t=123:1:2#hash",
      "named@http://localhost:63315/src/QueryOnly.ts?t=123:2:3",
      "named@http://localhost:63315/src/HashOnly.ts#hash:3:4",
      "named@http://localhost:63315/src/HashBeforeQuery.ts#hash?query:4:5",
      "@/Users/me/dev/evolu/packages/common/src/Task.ts:3:4",
      "at C:\\repo\\packages\\common\\src\\StackTrace.ts:5:6",
    ].join("\n");

    expect(parseStackTrace(stack).files).toEqual([
      "Task.test.ts",
      "QueryOnly.ts",
      "HashOnly.ts",
      "HashBeforeQuery.ts",
      "Task.ts",
      "StackTrace.ts",
    ]);
  });

  test("filters source names by allowlist", () => {
    const stack = [
      "child@http://localhost:63315/src/Task.test.ts:1:2",
      "parseStackTrace@http://localhost:63315/src/StackTrace.ts:3:4",
      "runTest@http://localhost:63315/chunk-artifact.js:5:6",
    ].join("\n");

    const stackTrace = parseStackTrace(stack, {
      sourceNameAllowlist: new Set(["Task.test.ts", "StackTrace.ts"]),
    });

    expect(stackTrace.files).toEqual(["Task.test.ts", "StackTrace.ts"]);
    expect(stackTrace.names).toEqual(["child", "parseStackTrace"]);
  });

  test("records source labels", () => {
    const sourceLabelsByLine = new Map<number, string>();
    const sourceName = parseStackTrace(new Error().stack).frames[0]?.sourceName;

    const options = {
      sourceLabelsByLine,
      sourceName,
    };

    parseStackTrace(new Error().stack, {
      ...options,
      sourceLabel: "current source site",
    });

    expect(parseStackTrace(new Error().stack, options).sites).toContain(
      "current source site",
    );

    const emptyOptions = {
      sourceLabelsByLine: new Map<number, string>(),
      sourceName,
    };

    expect(parseStackTrace(new Error().stack, emptyOptions).sites).toEqual([]);

    const missingOptions = {
      sourceLabelsByLine: new Map<number, string>(),
      sourceName: "Missing.test.ts",
    };

    parseStackTrace(new Error().stack, {
      ...missingOptions,
      sourceLabel: "missing source site",
    });

    expect(parseStackTrace(new Error().stack, missingOptions).sites).toEqual(
      [],
    );
  });

  test("captures thrown stack traces", async () => {
    const sourceLabelsByLine = new Map<number, string>();
    const sourceName = parseStackTrace(new Error().stack).frames[0]?.sourceName;

    const options = {
      sourceLabelsByLine,
      sourceName,
    };

    const stackTrace = await parseStackTrace(
      () => {
        parseStackTrace(new Error().stack, {
          ...options,
          sourceLabel: "throw site",
        });
        return Promise.reject(new Error("boom"));
      },
      { ...options, sourceLabel: "capture site" },
    );

    expect(stackTrace.files).toContain(sourceName);
    expect(stackTrace.sites).toEqual(expect.arrayContaining(["throw site"]));

    const stackTraceWithoutLabels = await parseStackTrace(() =>
      Promise.reject(new Error("boom")),
    );

    expect(stackTraceWithoutLabels.sites).toEqual([]);

    const nonErrorRejection: Error = "boom" as never;

    await expect(
      parseStackTrace(() => Promise.reject(nonErrorRejection)),
    ).rejects.toBe(nonErrorRejection);

    await expect(
      parseStackTrace(() => Promise.resolve(undefined as never)),
    ).rejects.toThrow("Stack trace capture must throw.");
  });

  // Engine support summary:
  // - V8 links async parent frames for await, Promise.all, allSettled, any,
  //   race, nested Promise.all inside Promise.race, and a Promise.then bridge,
  //   but not through the withResolvers bridge. Re-racing an already-started
  //   worker promise links through the worker but drops the parent frame.
  // - SpiderMonkey links async parent frames for all probed shapes.
  // - JSC/WebKit omits function names. It links source sites for await, direct
  //   Promise combinators, and direct race-with-wake pool shapes. For nested
  //   Promise combinator shapes, it links through the worker await but drops
  //   the outer parent await site; bridges keep only the child throw site.
  // - Hermes has no JS-visible async parent-chain support in Error.stack;
  //   React Native reports generated bundle frames containing only the child
  //   throw site for every probed shape.
  test("documents Promise async stack linking support", async () => {
    const sourceLabelsByLine = new Map<number, string>();
    const sourceName = parseStackTrace(new Error().stack).frames[0]?.sourceName;
    const stackTraceOptions = {
      sourceLabelsByLine,
      sourceNameAllowlist: new Set([sourceName]),
      sourceName,
    };
    const nativeAwaitChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "await child throws",
      });
      throw new Error("boom");
    };
    const nativeAwaitParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "await parent awaits child",
      });
      return await nativeAwaitChild();
    };

    const nativePromiseAllChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseAllParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all parent awaits combinator",
      });
      const [value] = await Promise.all([nativePromiseAllChild()]);
      return value;
    };

    const nativePromiseAllSettledChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.allSettled child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseAllSettledParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.allSettled parent awaits combinator",
      });
      const [settled] = await Promise.allSettled([
        nativePromiseAllSettledChild(),
      ]);
      if (settled.status !== "rejected")
        throw new Error("Promise.allSettled probe must reject.");
      throw settled.reason;
    };

    const nativePromiseAnyChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.any child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseAnyParent = async (): Promise<never> => {
      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "Promise.any parent awaits combinator",
        });
        await Promise.any([nativePromiseAnyChild()]);
      } catch (error) {
        if (!(error instanceof AggregateError)) throw error;

        const reason: unknown = error.errors[0];
        if (!(reason instanceof Error)) throw error;

        throw reason;
      }

      throw new Error("Promise.any probe must reject.");
    };

    const nativePromiseRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.race child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseRaceParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.race parent awaits combinator",
      });
      return await Promise.race([nativePromiseRaceChild()]);
    };

    const nativePromiseAllInRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all in Promise.race child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseAllInRaceWorker = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all in Promise.race worker awaits child",
      });
      return await nativePromiseAllInRaceChild();
    };
    const nativePromiseAllInRaceParent = async (): Promise<never> => {
      const inert = Promise.withResolvers<never>();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all in Promise.race parent awaits combinators",
      });
      const [value] = await Promise.race([
        Promise.all([nativePromiseAllInRaceWorker()]),
        inert.promise,
      ]);
      return value;
    };

    const nativePromiseRaceInRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.race in Promise.race child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseRaceInRaceWorker = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.race in Promise.race worker awaits child",
      });
      return await nativePromiseRaceInRaceChild();
    };
    const nativePromiseRaceInRaceParent = async (): Promise<never> => {
      const inert = Promise.withResolvers<never>();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.race in Promise.race parent awaits combinators",
      });
      return await Promise.race([
        Promise.race([nativePromiseRaceInRaceWorker()]),
        inert.promise,
      ]);
    };

    const nativePromiseAllInAllChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all in Promise.all child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseAllInAllWorker = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all in Promise.all worker awaits child",
      });
      return await nativePromiseAllInAllChild();
    };
    const nativePromiseAllInAllParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.all in Promise.all parent awaits combinators",
      });
      const [[value]] = await Promise.all([
        Promise.all([nativePromiseAllInAllWorker()]),
      ]);
      return value;
    };

    const nativePromiseAllSettledInRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.allSettled in Promise.race child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseAllSettledInRaceWorker = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.allSettled in Promise.race worker awaits child",
      });
      return await nativePromiseAllSettledInRaceChild();
    };
    const nativePromiseAllSettledInRaceParent = async (): Promise<never> => {
      const inert = Promise.withResolvers<never>();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel:
          "Promise.allSettled in Promise.race parent awaits combinators",
      });
      const [settled] = await Promise.race([
        Promise.allSettled([nativePromiseAllSettledInRaceWorker()]),
        inert.promise,
      ]);
      if (settled.status !== "rejected")
        throw new Error(
          "Promise.allSettled in Promise.race probe must reject.",
        );
      throw settled.reason;
    };

    const composedPromiseRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "composed Promise.race child throws",
      });
      throw new Error("boom");
    };
    const composedPromiseRaceInner = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "composed Promise.race inner awaits combinator",
      });
      return await Promise.race([composedPromiseRaceChild()]);
    };
    const composedPromiseRaceParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "composed Promise.race parent awaits combinator",
      });
      return await Promise.race([composedPromiseRaceInner()]);
    };

    const poolShapeChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool shape child throws",
      });
      throw new Error("boom");
    };
    let poolShapeDefect: Error | undefined;
    let poolShapeStopped = false;
    const poolShapeWake = Promise.withResolvers<"abort">();
    const poolShapeRunTask = async (): Promise<never> => {
      try {
        return await poolShapeChild();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        poolShapeDefect = error;
        poolShapeWake.resolve("abort");
        throw error;
      }
    };
    const poolShapeWorker = async (): Promise<void> => {
      let nextIndex = 0;
      while (nextIndex < 1) {
        nextIndex += 1;
        try {
          parseStackTrace(new Error().stack, {
            ...stackTraceOptions,
            sourceLabel: "pool shape worker awaits child",
          });
          await poolShapeRunTask();
        } catch (error) {
          poolShapeStopped = true;
          throw error;
        }
      }
    };
    const poolShapeParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool shape parent awaits combinators",
      });
      await Promise.race([
        Promise.all([poolShapeWorker()]),
        poolShapeWake.promise,
      ]);
      if (!poolShapeDefect)
        throw new Error("pool shape probe must capture defect.");
      if (!poolShapeStopped)
        throw new Error("pool shape probe must stop the worker.");
      throw poolShapeDefect;
    };

    const poolSingleRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool single race child throws",
      });
      throw new Error("boom");
    };
    let poolSingleRaceDefect: Error | undefined;
    let poolSingleRaceStopped = false;
    const poolSingleRaceWake = Promise.withResolvers<"abort">();
    const poolSingleRaceRunTask = async (): Promise<never> => {
      try {
        return await poolSingleRaceChild();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        poolSingleRaceDefect = error;
        poolSingleRaceWake.resolve("abort");
        throw error;
      }
    };
    const poolSingleRaceWorker = async (): Promise<void> => {
      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool single race worker awaits child",
        });
        await poolSingleRaceRunTask();
      } catch (error) {
        poolSingleRaceStopped = true;
        throw error;
      }
    };
    const poolSingleRaceParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool single race parent awaits worker or wake",
      });
      await Promise.race([poolSingleRaceWorker(), poolSingleRaceWake.promise]);
      if (!poolSingleRaceDefect)
        throw new Error("pool single race probe must capture defect.");
      if (!poolSingleRaceStopped)
        throw new Error("pool single race probe must stop the worker.");
      throw poolSingleRaceDefect;
    };

    const poolMultiRaceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool multi race child throws",
      });
      throw new Error("boom");
    };
    let poolMultiRaceDefect: Error | undefined;
    let poolMultiRaceStopped = false;
    const poolMultiRaceWake = Promise.withResolvers<"abort">();
    const poolMultiRaceBlocker = Promise.withResolvers<void>();
    const poolMultiRaceRunTask = async (): Promise<never> => {
      try {
        return await poolMultiRaceChild();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        poolMultiRaceDefect = error;
        poolMultiRaceWake.resolve("abort");
        throw error;
      }
    };
    const poolMultiRaceWorker = async (slot: number): Promise<void> => {
      if (slot === 0) {
        await poolMultiRaceBlocker.promise;
        return;
      }

      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool multi race worker awaits child",
        });
        await poolMultiRaceRunTask();
      } catch (error) {
        poolMultiRaceStopped = true;
        throw error;
      }
    };
    const poolMultiRaceParent = async (): Promise<never> => {
      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool multi race parent awaits workers or wake",
        });
        await Promise.race([
          poolMultiRaceWorker(0),
          poolMultiRaceWorker(1),
          poolMultiRaceWake.promise,
        ]);
        if (!poolMultiRaceDefect)
          throw new Error("pool multi race probe must capture defect.");
        if (!poolMultiRaceStopped)
          throw new Error("pool multi race probe must stop the worker.");
        throw poolMultiRaceDefect;
      } finally {
        poolMultiRaceBlocker.resolve();
      }
    };

    const poolReraceChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool rerace child throws",
      });
      throw new Error("boom");
    };
    let poolReraceDefect: Error | undefined;
    let poolReraceStopped = false;
    const poolReraceWake = Promise.withResolvers<"abort">();
    const poolReraceStartDefect = Promise.withResolvers<void>();
    const poolReraceRunTask = async (): Promise<never> => {
      try {
        return await poolReraceChild();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        poolReraceDefect = error;
        poolReraceWake.resolve("abort");
        throw error;
      }
    };
    const poolReraceWorker = async (slot: number): Promise<number> => {
      if (slot === 0) return slot;

      await poolReraceStartDefect.promise;
      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool rerace worker awaits child",
        });
        await poolReraceRunTask();
      } catch (error) {
        poolReraceStopped = true;
        throw error;
      }

      throw new Error("pool rerace worker must reject.");
    };
    const poolReraceParent = async (): Promise<never> => {
      const running = new Map([
        [0, poolReraceWorker(0)],
        [1, poolReraceWorker(1)],
      ]);

      for (;;) {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool rerace parent awaits workers or wake",
        });
        const outcome = await Promise.race([
          ...running.values(),
          poolReraceWake.promise,
        ]);
        if (outcome === "abort") {
          if (!poolReraceDefect)
            throw new Error("pool rerace probe must capture defect.");
          if (!poolReraceStopped)
            throw new Error("pool rerace probe must stop the worker.");
          throw poolReraceDefect;
        }

        running.delete(outcome);
        if (outcome === 0) poolReraceStartDefect.resolve();
        if (running.size === 0)
          throw new Error("pool rerace probe must reject.");
      }
    };

    const poolParkedChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool parked child throws",
      });
      throw new Error("boom");
    };
    let poolParkedDefect: Error | undefined;
    let poolParkedStopped = false;
    const poolParked = new Promise<never>((resolve) => {
      void resolve;
    });
    const poolParkedWake = Promise.withResolvers<"abort">();
    const poolParkedFirstWorkerParked = Promise.withResolvers<void>();
    const poolParkedRunTask = async (): Promise<never> => {
      try {
        return await poolParkedChild();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        poolParkedDefect = error;
        poolParkedWake.resolve("abort");
        throw error;
      }
    };
    const poolParkedWorker = async (slot: number): Promise<never> => {
      if (slot === 0) {
        poolParkedFirstWorkerParked.resolve();
        return await poolParked;
      }

      await Promise.resolve();
      await poolParkedFirstWorkerParked.promise;
      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool parked worker awaits child",
        });
        await poolParkedRunTask();
      } catch (error) {
        poolParkedStopped = true;
        throw error;
      }

      return await poolParked;
    };
    const poolParkedParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool parked parent awaits workers or wake",
      });
      await Promise.race([
        poolParkedWorker(0),
        poolParkedWorker(1),
        poolParkedWake.promise,
      ]);
      if (!poolParkedDefect)
        throw new Error("pool parked probe must capture defect.");
      if (!poolParkedStopped)
        throw new Error("pool parked probe must stop the worker.");
      throw poolParkedDefect;
    };

    const poolParkedWakeRejectChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool parked wake reject child throws",
      });
      throw new Error("boom");
    };
    let poolParkedWakeRejectStopped = false;
    const poolParkedWakeReject = new Promise<never>((resolve) => {
      void resolve;
    });
    const poolParkedWakeRejectWake = Promise.withResolvers<never>();
    const poolParkedWakeRejectFirstWorkerParked = Promise.withResolvers<void>();
    const poolParkedWakeRejectRunTask = async (): Promise<never> => {
      try {
        return await poolParkedWakeRejectChild();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        poolParkedWakeRejectWake.reject(error);
        throw error;
      }
    };
    const poolParkedWakeRejectWorker = async (slot: number): Promise<never> => {
      if (slot === 0) {
        poolParkedWakeRejectFirstWorkerParked.resolve();
        return await poolParkedWakeReject;
      }

      await Promise.resolve();
      await poolParkedWakeRejectFirstWorkerParked.promise;
      try {
        parseStackTrace(new Error().stack, {
          ...stackTraceOptions,
          sourceLabel: "pool parked wake reject worker awaits child",
        });
        await poolParkedWakeRejectRunTask();
      } catch (error) {
        poolParkedWakeRejectStopped = true;
        throw error;
      }

      return await poolParkedWakeReject;
    };
    const poolParkedWakeRejectParent = async (): Promise<never> => {
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "pool parked wake reject parent awaits workers or wake",
      });
      try {
        await Promise.race([
          poolParkedWakeRejectWorker(0),
          poolParkedWakeRejectWorker(1),
          poolParkedWakeRejectWake.promise,
        ]);
      } catch (error) {
        if (!poolParkedWakeRejectStopped)
          throw new Error(
            "pool parked wake reject probe must stop the worker.",
            {
              cause: error,
            },
          );
        throw error;
      }

      throw new Error("pool parked wake reject probe must reject.");
    };

    const nativePromiseThenChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.then child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseThenParent = async (): Promise<never> => {
      const deferred = Promise.withResolvers<never>();
      void nativePromiseThenChild().then(deferred.resolve, deferred.reject);
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.then parent awaits bridge",
      });
      await deferred.promise;
      throw new Error("Promise.then probe must reject.");
    };

    const nativePromiseWithResolversChild = async (): Promise<never> => {
      await Promise.resolve();
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.withResolvers child throws",
      });
      throw new Error("boom");
    };
    const nativePromiseWithResolversParent = async (): Promise<never> => {
      const deferred = Promise.withResolvers<never>();
      void nativePromiseWithResolversChild().catch(deferred.reject);
      parseStackTrace(new Error().stack, {
        ...stackTraceOptions,
        sourceLabel: "Promise.withResolvers parent awaits bridge",
      });
      await deferred.promise;
      throw new Error("Promise.withResolvers probe must reject.");
    };

    const engine = await jsEngine;
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits native await probe",
    });
    const awaitStack = await parseStackTrace(nativeAwaitParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.all probe",
    });
    const promiseAllStack = await parseStackTrace(nativePromiseAllParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.allSettled probe",
    });
    const promiseAllSettledStack = await parseStackTrace(
      nativePromiseAllSettledParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.any probe",
    });
    const promiseAnyStack = await parseStackTrace(nativePromiseAnyParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.race probe",
    });
    const promiseRaceStack = await parseStackTrace(nativePromiseRaceParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.all in Promise.race probe",
    });
    const promiseAllInRaceStack = await parseStackTrace(
      nativePromiseAllInRaceParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.race in Promise.race probe",
    });
    const promiseRaceInRaceStack = await parseStackTrace(
      nativePromiseRaceInRaceParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.all in Promise.all probe",
    });
    const promiseAllInAllStack = await parseStackTrace(
      nativePromiseAllInAllParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.allSettled in Promise.race probe",
    });
    const promiseAllSettledInRaceStack = await parseStackTrace(
      nativePromiseAllSettledInRaceParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits composed Promise.race probe",
    });
    const composedPromiseRaceStack = await parseStackTrace(
      composedPromiseRaceParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits pool shape probe",
    });
    const poolShapeStack = await parseStackTrace(poolShapeParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits pool single race probe",
    });
    const poolSingleRaceStack = await parseStackTrace(poolSingleRaceParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits pool multi race probe",
    });
    const poolMultiRaceStack = await parseStackTrace(poolMultiRaceParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits pool rerace probe",
    });
    const poolReraceStack = await parseStackTrace(poolReraceParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits pool parked probe",
    });
    const poolParkedStack = await parseStackTrace(poolParkedParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits pool parked wake reject probe",
    });
    const poolParkedWakeRejectStack = await parseStackTrace(
      poolParkedWakeRejectParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.then probe",
    });
    const promiseThenStack = await parseStackTrace(nativePromiseThenParent, {
      ...stackTraceOptions,
      sourceLabel: "parseStackTrace awaits probe",
    });
    parseStackTrace(new Error().stack, {
      ...stackTraceOptions,
      sourceLabel: "matrix awaits Promise.withResolvers probe",
    });
    const promiseWithResolversStack = await parseStackTrace(
      nativePromiseWithResolversParent,
      {
        ...stackTraceOptions,
        sourceLabel: "parseStackTrace awaits probe",
      },
    );
    const matrix = {
      await: awaitStack,
      "Promise.all": promiseAllStack,
      "Promise.allSettled": promiseAllSettledStack,
      "Promise.any": promiseAnyStack,
      "Promise.race": promiseRaceStack,
      "Promise.all in Promise.race": promiseAllInRaceStack,
      "Promise.race in Promise.race": promiseRaceInRaceStack,
      "Promise.all in Promise.all": promiseAllInAllStack,
      "Promise.allSettled in Promise.race": promiseAllSettledInRaceStack,
      "composed Promise.race": composedPromiseRaceStack,
      "pool shape": poolShapeStack,
      "pool single race": poolSingleRaceStack,
      "pool multi race": poolMultiRaceStack,
      "pool rerace": poolReraceStack,
      "pool parked": poolParkedStack,
      "pool parked wake reject": poolParkedWakeRejectStack,
      "Promise.then bridge": promiseThenStack,
      "Promise.withResolvers bridge": promiseWithResolversStack,
    };
    const namesMatrix = Object.fromEntries(
      Object.entries(matrix).map(([name, { names }]) => [name, names]),
    );
    const sitesMatrix = Object.fromEntries(
      Object.entries(matrix).map(([name, { sites }]) => [name, sites]),
    );

    if (engine === "v8") {
      expect(namesMatrix).toEqual({
        "Promise.all": ["nativePromiseAllChild", "nativePromiseAllParent"],
        "Promise.allSettled": [
          "nativePromiseAllSettledChild",
          "nativePromiseAllSettledParent",
        ],
        "Promise.any": ["nativePromiseAnyChild", "nativePromiseAnyParent"],
        "Promise.race": ["nativePromiseRaceChild", "nativePromiseRaceParent"],
        "Promise.all in Promise.race": [
          "nativePromiseAllInRaceChild",
          "nativePromiseAllInRaceWorker",
          "nativePromiseAllInRaceParent",
        ],
        "Promise.race in Promise.race": [
          "nativePromiseRaceInRaceChild",
          "nativePromiseRaceInRaceWorker",
          "nativePromiseRaceInRaceParent",
        ],
        "Promise.all in Promise.all": [
          "nativePromiseAllInAllChild",
          "nativePromiseAllInAllWorker",
          "nativePromiseAllInAllParent",
        ],
        "Promise.allSettled in Promise.race": [
          "nativePromiseAllSettledInRaceChild",
          "nativePromiseAllSettledInRaceWorker",
          "nativePromiseAllSettledInRaceParent",
        ],
        "composed Promise.race": [
          "composedPromiseRaceChild",
          "composedPromiseRaceInner",
          "composedPromiseRaceParent",
        ],
        "pool shape": [
          "poolShapeChild",
          "poolShapeRunTask",
          "poolShapeWorker",
          "poolShapeParent",
        ],
        "pool single race": [
          "poolSingleRaceChild",
          "poolSingleRaceRunTask",
          "poolSingleRaceWorker",
          "poolSingleRaceParent",
        ],
        "pool multi race": [
          "poolMultiRaceChild",
          "poolMultiRaceRunTask",
          "poolMultiRaceWorker",
          "poolMultiRaceParent",
        ],
        "pool rerace": [
          "poolReraceChild",
          "poolReraceRunTask",
          "poolReraceWorker",
        ],
        "pool parked": [
          "poolParkedChild",
          "poolParkedRunTask",
          "poolParkedWorker",
          "poolParkedParent",
        ],
        "pool parked wake reject": [
          "poolParkedWakeRejectChild",
          "poolParkedWakeRejectRunTask",
          "poolParkedWakeRejectWorker",
          "poolParkedWakeRejectParent",
        ],
        "Promise.then bridge": [
          "nativePromiseThenChild",
          "nativePromiseThenParent",
        ],
        "Promise.withResolvers bridge": ["nativePromiseWithResolversChild"],
        await: ["nativeAwaitChild", "nativeAwaitParent"],
      });
    } else if (engine === "spidermonkey") {
      expect(namesMatrix).toEqual({
        "Promise.all": ["nativePromiseAllChild", "nativePromiseAllParent"],
        "Promise.allSettled": [
          "nativePromiseAllSettledChild",
          "nativePromiseAllSettledParent",
        ],
        "Promise.any": ["nativePromiseAnyChild", "nativePromiseAnyParent"],
        "Promise.race": ["nativePromiseRaceChild", "nativePromiseRaceParent"],
        "Promise.all in Promise.race": [
          "nativePromiseAllInRaceChild",
          "nativePromiseAllInRaceWorker",
          "nativePromiseAllInRaceParent",
        ],
        "Promise.race in Promise.race": [
          "nativePromiseRaceInRaceChild",
          "nativePromiseRaceInRaceWorker",
          "nativePromiseRaceInRaceParent",
        ],
        "Promise.all in Promise.all": [
          "nativePromiseAllInAllChild",
          "nativePromiseAllInAllWorker",
          "nativePromiseAllInAllParent",
        ],
        "Promise.allSettled in Promise.race": [
          "nativePromiseAllSettledInRaceChild",
          "nativePromiseAllSettledInRaceWorker",
          "nativePromiseAllSettledInRaceParent",
        ],
        "composed Promise.race": [
          "composedPromiseRaceChild",
          "composedPromiseRaceInner",
          "composedPromiseRaceParent",
        ],
        "pool shape": [
          "poolShapeChild",
          "poolShapeRunTask",
          "poolShapeWorker",
          "poolShapeParent",
        ],
        "pool single race": [
          "poolSingleRaceChild",
          "poolSingleRaceRunTask",
          "poolSingleRaceWorker",
          "poolSingleRaceParent",
        ],
        "pool multi race": [
          "poolMultiRaceChild",
          "poolMultiRaceRunTask",
          "poolMultiRaceWorker",
          "poolMultiRaceParent",
        ],
        "pool rerace": [
          "poolReraceChild",
          "poolReraceRunTask",
          "poolReraceWorker",
          "poolReraceParent",
        ],
        "pool parked": [
          "poolParkedChild",
          "poolParkedRunTask",
          "poolParkedWorker",
          "poolParkedParent",
        ],
        "pool parked wake reject": [
          "poolParkedWakeRejectChild",
          "poolParkedWakeRejectRunTask",
          "poolParkedWakeRejectWorker",
          "poolParkedWakeRejectParent",
        ],
        "Promise.then bridge": [
          "nativePromiseThenChild",
          "nativePromiseThenParent",
        ],
        "Promise.withResolvers bridge": [
          "nativePromiseWithResolversChild",
          "nativePromiseWithResolversParent",
        ],
        await: ["nativeAwaitChild", "nativeAwaitParent"],
      });
    } else if (engine === "jsc") {
      expect(sitesMatrix).toEqual({
        "Promise.all": [
          "Promise.all child throws",
          "Promise.all parent awaits combinator",
          "parseStackTrace awaits probe",
        ],
        "Promise.allSettled": [
          "Promise.allSettled child throws",
          "Promise.allSettled parent awaits combinator",
          "parseStackTrace awaits probe",
        ],
        "Promise.any": [
          "Promise.any child throws",
          "Promise.any parent awaits combinator",
          "parseStackTrace awaits probe",
        ],
        "Promise.race": [
          "Promise.race child throws",
          "Promise.race parent awaits combinator",
          "parseStackTrace awaits probe",
        ],
        "Promise.all in Promise.race": [
          "Promise.all in Promise.race child throws",
          "Promise.all in Promise.race worker awaits child",
        ],
        "Promise.race in Promise.race": [
          "Promise.race in Promise.race child throws",
          "Promise.race in Promise.race worker awaits child",
        ],
        "Promise.all in Promise.all": [
          "Promise.all in Promise.all child throws",
          "Promise.all in Promise.all worker awaits child",
        ],
        "Promise.allSettled in Promise.race": [
          "Promise.allSettled in Promise.race child throws",
          "Promise.allSettled in Promise.race worker awaits child",
        ],
        "composed Promise.race": [
          "composed Promise.race child throws",
          "composed Promise.race inner awaits combinator",
          "composed Promise.race parent awaits combinator",
          "parseStackTrace awaits probe",
        ],
        "pool shape": [
          "pool shape child throws",
          "pool shape worker awaits child",
        ],
        "pool single race": [
          "pool single race child throws",
          "pool single race worker awaits child",
          "pool single race parent awaits worker or wake",
          "parseStackTrace awaits probe",
        ],
        "pool multi race": [
          "pool multi race child throws",
          "pool multi race worker awaits child",
          "pool multi race parent awaits workers or wake",
          "parseStackTrace awaits probe",
        ],
        "pool rerace": [
          "pool rerace child throws",
          "pool rerace worker awaits child",
          "pool rerace parent awaits workers or wake",
          "parseStackTrace awaits probe",
        ],
        "pool parked": [
          "pool parked child throws",
          "pool parked worker awaits child",
          "pool parked parent awaits workers or wake",
          "parseStackTrace awaits probe",
        ],
        "pool parked wake reject": [
          "pool parked wake reject child throws",
          "pool parked wake reject worker awaits child",
          "pool parked wake reject parent awaits workers or wake",
          "parseStackTrace awaits probe",
        ],
        "Promise.then bridge": ["Promise.then child throws"],
        "Promise.withResolvers bridge": ["Promise.withResolvers child throws"],
        await: [
          "await child throws",
          "await parent awaits child",
          "parseStackTrace awaits probe",
        ],
      });
    } else {
      expect(sitesMatrix).toEqual({
        "Promise.all": ["Promise.all child throws"],
        "Promise.allSettled": ["Promise.allSettled child throws"],
        "Promise.any": ["Promise.any child throws"],
        "Promise.race": ["Promise.race child throws"],
        "Promise.all in Promise.race": [
          "Promise.all in Promise.race child throws",
        ],
        "Promise.race in Promise.race": [
          "Promise.race in Promise.race child throws",
        ],
        "Promise.all in Promise.all": [
          "Promise.all in Promise.all child throws",
        ],
        "Promise.allSettled in Promise.race": [
          "Promise.allSettled in Promise.race child throws",
        ],
        "composed Promise.race": ["composed Promise.race child throws"],
        "pool shape": ["pool shape child throws"],
        "pool single race": ["pool single race child throws"],
        "pool multi race": ["pool multi race child throws"],
        "pool rerace": ["pool rerace child throws"],
        "pool parked": ["pool parked child throws"],
        "pool parked wake reject": ["pool parked wake reject child throws"],
        "Promise.then bridge": ["Promise.then child throws"],
        "Promise.withResolvers bridge": ["Promise.withResolvers child throws"],
        await: ["await child throws"],
      });
    }
  });

  test("ignores lines without source positions", () => {
    const stack = [
      "",
      "Error: boom",
      "    at childTask",
      "    at childTask (http://localhost:63315/src/Task.test.ts)",
      "    at childTask (http://localhost:63315/src/Task.test.ts:10)",
      "    at childTask (http://localhost:63315/src/Task.test.ts:a:2)",
      "    at childTask (http://localhost:63315/src/Task.test.ts:10:b)",
    ].join("\n");

    expect(parseStackTrace(undefined).frames).toEqual([]);
    expect(parseStackTrace(stack).frames).toEqual([]);
  });
});
