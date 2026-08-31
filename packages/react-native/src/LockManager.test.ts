import {
  assertEqual,
  assertRejectsInstanceOf,
  assertRejectsSame,
  testName,
} from "@evolu/common";
import { describe, it } from "node:test";
import { lockManager } from "./LockManager.ts";

const assertRejectsWithName = async (
  promise: PromiseLike<unknown>,
  name: string,
): Promise<void> => {
  const error = await assertRejectsInstanceOf(promise, Error);
  assertEqual(error.name, name);
};

describe("lockManager", () => {
  describe("request", () => {
    it("holds an exclusive lock until the callback settles", async () => {
      const first = Promise.withResolvers<void>();

      let secondStarted = false;

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        await first.promise;
        return "first";
      });

      const secondRequest = lockManager.request(testName, (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        secondStarted = true;
        return "second";
      });

      assertEqual(secondStarted, false);

      first.resolve();

      assertEqual(await firstRequest, "first");
      assertEqual(await secondRequest, "second");
    });

    it("grants compatible shared requests before a queued exclusive request", async () => {
      const releaseShared = Promise.withResolvers<void>();
      const steps: Array<string> = [];

      const firstSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          steps.push("shared-1-start");
          await releaseShared.promise;
          steps.push("shared-1-end");
          return "shared-1";
        },
      );

      const exclusiveRequest = lockManager.request(testName, (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        steps.push("exclusive-start");
        return "exclusive";
      });

      const secondSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          steps.push("shared-2-start");
          return "shared-2";
        },
      );

      await Promise.resolve();

      assertEqual(steps, ["shared-1-start"]);

      releaseShared.resolve();

      assertEqual(await firstSharedRequest, "shared-1");
      assertEqual(await exclusiveRequest, "exclusive");
      assertEqual(await secondSharedRequest, "shared-2");
      assertEqual(steps, [
        "shared-1-start",
        "shared-1-end",
        "exclusive-start",
        "shared-2-start",
      ]);
    });

    it("grants compatible shared requests together when no exclusive request blocks them", async () => {
      const releaseShared = Promise.withResolvers<void>();
      const steps: Array<string> = [];

      const firstSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          steps.push("shared-1-start");
          await releaseShared.promise;
          return "shared-1";
        },
      );

      const secondSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          steps.push("shared-2-start");
          await releaseShared.promise;
          return "shared-2";
        },
      );

      await Promise.resolve();

      assertEqual(steps, ["shared-1-start", "shared-2-start"]);

      releaseShared.resolve();

      assertEqual(await firstSharedRequest, "shared-1");
      assertEqual(await secondSharedRequest, "shared-2");
    });

    it("invokes the callback with null asynchronously when ifAvailable cannot grant immediately", async () => {
      const first = Promise.withResolvers<void>();
      let secondCallbackCalled = false;

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        await first.promise;
        return "first";
      });

      const secondRequest = lockManager.request(
        testName,
        { ifAvailable: true },
        (lock) => {
          secondCallbackCalled = true;
          assertEqual(lock, null);
          return "unavailable";
        },
      );

      assertEqual(secondCallbackCalled, false);

      assertEqual(await secondRequest, "unavailable");

      first.resolve();
      assertEqual(await firstRequest, "first");
    });

    it("grants an exclusive ifAvailable request immediately when the name is free", async () => {
      assertEqual(
        await lockManager.request(testName, { ifAvailable: true }, (lock) => {
          assertEqual(lock, { mode: "exclusive", name: testName });
          return "granted";
        }),
        "granted",
      );
    });

    it("invokes the callback with null when ifAvailable sees a queued request", async () => {
      const releaseFirst = Promise.withResolvers<void>();

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        await releaseFirst.promise;
        return "first";
      });

      const queuedRequest = lockManager.request(testName, (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        return "queued";
      });

      const ifAvailableResult = await lockManager.request(
        testName,
        { ifAvailable: true },
        (lock) => {
          assertEqual(lock, null);
          return "unavailable";
        },
      );

      assertEqual(ifAvailableResult, "unavailable");

      releaseFirst.resolve();
      assertEqual(await firstRequest, "first");
      assertEqual(await queuedRequest, "queued");
    });

    it("grants a shared ifAvailable request when shared locks already hold the name", async () => {
      const releaseShared = Promise.withResolvers<void>();

      const firstSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          await releaseShared.promise;
          return "shared-1";
        },
      );

      const secondSharedResult = await lockManager.request(
        testName,
        { ifAvailable: true, mode: "shared" },
        (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          return "shared-2";
        },
      );

      assertEqual(secondSharedResult, "shared-2");

      releaseShared.resolve();
      assertEqual(await firstSharedRequest, "shared-1");
    });

    it("rejects with the abort reason when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(
        new DOMException("The request was aborted.", "AbortError"),
      );

      await assertRejectsWithName(
        lockManager.request(
          testName,
          { signal: controller.signal },
          () => "unreachable",
        ),
        "AbortError",
      );
    });

    it("rejects a queued request when its signal aborts before grant", async () => {
      const releaseFirst = Promise.withResolvers<void>();
      const controller = new AbortController();

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        await releaseFirst.promise;
        return "first";
      });

      const secondRequest = lockManager.request(
        testName,
        { signal: controller.signal },
        () => "second",
      );

      controller.abort(
        new DOMException("The request was aborted.", "AbortError"),
      );

      await assertRejectsWithName(secondRequest, "AbortError");

      releaseFirst.resolve();
      assertEqual(await firstRequest, "first");
      assertEqual(await lockManager.query(), {
        held: [],
        pending: [],
      });
    });

    it("does not invoke the callback when the signal aborts after grant but before callback starts", async () => {
      const controller = new AbortController();
      let callbackCalled = false;

      const request = lockManager.request(
        testName,
        { signal: controller.signal },
        (lock) => {
          callbackCalled = true;
          assertEqual(lock, { mode: "exclusive", name: testName });
          return "granted";
        },
      );

      controller.abort(
        new DOMException("The request was aborted.", "AbortError"),
      );

      await assertRejectsWithName(request, "AbortError");
      assertEqual(callbackCalled, false);

      assertEqual(
        await lockManager.request(testName, (lock) => {
          assertEqual(lock, { mode: "exclusive", name: testName });
          return "next";
        }),
        "next",
      );
    });

    it("ignores signal aborts after the lock has been granted", async () => {
      const controller = new AbortController();

      const result = await lockManager.request(
        testName,
        { signal: controller.signal },
        (lock) => {
          assertEqual(lock, { mode: "exclusive", name: testName });
          controller.abort(
            new DOMException("The request was aborted.", "AbortError"),
          );
          return "granted";
        },
      );

      assertEqual(result, "granted");
    });

    it("releases the lock when the callback throws", async () => {
      const error = new Error("boom");

      const firstRequest = lockManager.request(testName, () => {
        throw error;
      });

      const secondRequest = lockManager.request(testName, (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        return "second";
      });

      await assertRejectsSame(firstRequest, error);
      assertEqual(await secondRequest, "second");
    });

    it("rejects names starting with a hyphen", async () => {
      await assertRejectsWithName(
        lockManager.request("-reserved", () => "unreachable"),
        "NotSupportedError",
      );
    });

    it("rejects using ifAvailable together with steal", async () => {
      await assertRejectsWithName(
        lockManager.request(
          testName,
          { ifAvailable: true, steal: true },
          () => "unreachable",
        ),
        "NotSupportedError",
      );
    });

    it("rejects using steal with shared mode", async () => {
      await assertRejectsWithName(
        lockManager.request(
          testName,
          { mode: "shared", steal: true },
          () => "unreachable",
        ),
        "NotSupportedError",
      );
    });

    it("rejects using signal with ifAvailable", async () => {
      const controller = new AbortController();

      await assertRejectsWithName(
        lockManager.request(
          testName,
          { ifAvailable: true, signal: controller.signal },
          () => "unreachable",
        ),
        "NotSupportedError",
      );
    });

    it("rejects using signal with steal", async () => {
      const controller = new AbortController();

      await assertRejectsWithName(
        lockManager.request(
          testName,
          { signal: controller.signal, steal: true },
          () => "unreachable",
        ),
        "NotSupportedError",
      );
    });

    it("steal preempts held and queued requests for the same name", async () => {
      const releaseFirst = Promise.withResolvers<void>();
      const steps: Array<string> = [];

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        steps.push("first-start");
        await releaseFirst.promise;
        steps.push("first-end");
        return "first";
      });

      const queuedRequest = lockManager.request(testName, () => {
        steps.push("queued-start");
        return "queued";
      });

      const stolenRequest = lockManager.request(
        testName,
        { steal: true },
        (lock) => {
          assertEqual(lock, { mode: "exclusive", name: testName });
          steps.push("steal-start");
          return "steal";
        },
      );

      await assertRejectsWithName(firstRequest, "AbortError");
      assertEqual(await stolenRequest, "steal");

      assertEqual(steps, ["first-start", "steal-start", "queued-start"]);

      releaseFirst.resolve();

      assertEqual(await queuedRequest, "queued");
      assertEqual(steps, [
        "first-start",
        "steal-start",
        "queued-start",
        "first-end",
      ]);
    });

    it("steal behaves like a normal exclusive request when nothing is held", async () => {
      assertEqual(
        await lockManager.request(testName, { steal: true }, (lock) => {
          assertEqual(lock, { mode: "exclusive", name: testName });
          return "steal";
        }),
        "steal",
      );
    });
  });

  describe("query", () => {
    it("returns held and pending arrays in the snapshot", async () => {
      const releaseLock = Promise.withResolvers<void>();

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        await releaseLock.promise;
      });

      const secondRequest = lockManager.request(testName, () => undefined);

      await Promise.resolve();

      assertEqual(await lockManager.query(), {
        held: [
          {
            clientId: "react-native-main-thread",
            mode: "exclusive",
            name: testName,
          },
        ],
        pending: [
          {
            clientId: "react-native-main-thread",
            mode: "exclusive",
            name: testName,
          },
        ],
      });

      releaseLock.resolve();
      await firstRequest;
      await secondRequest;

      assertEqual(await lockManager.query(), {
        held: [],
        pending: [],
      });
    });

    it("preserves pending request order for the same resource", async () => {
      const releaseLock = Promise.withResolvers<void>();

      const firstRequest = lockManager.request(testName, async (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        await releaseLock.promise;
      });

      const secondRequest = lockManager.request(
        testName,
        { mode: "shared" },
        (lock) => {
          assertEqual(lock, { mode: "shared", name: testName });
          return "second";
        },
      );

      const thirdRequest = lockManager.request(testName, (lock) => {
        assertEqual(lock, { mode: "exclusive", name: testName });
        return "third";
      });

      await Promise.resolve();

      assertEqual(await lockManager.query(), {
        held: [
          {
            clientId: "react-native-main-thread",
            mode: "exclusive",
            name: testName,
          },
        ],
        pending: [
          {
            clientId: "react-native-main-thread",
            mode: "shared",
            name: testName,
          },
          {
            clientId: "react-native-main-thread",
            mode: "exclusive",
            name: testName,
          },
        ],
      });

      releaseLock.resolve();
      assertEqual(await firstRequest, undefined);
      assertEqual(await secondRequest, "second");
      assertEqual(await thirdRequest, "third");
    });
  });
});
