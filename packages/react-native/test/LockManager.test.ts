import { testName } from "@evolu/common";
import { describe, expect, test } from "vitest";
import { lockManager } from "../src/LockManager.js";

describe("lockManager", () => {
  describe("request", () => {
    test("holds an exclusive lock until the callback settles", async () => {
      const first = Promise.withResolvers<void>();

      let secondStarted = false;

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        await first.promise;
        return "first";
      });

      const secondRequest = lockManager.request(testName, (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        secondStarted = true;
        return "second";
      });

      expect(secondStarted).toBe(false);

      first.resolve();

      await expect(firstRequest).resolves.toBe("first");
      await expect(secondRequest).resolves.toBe("second");
    });

    test("grants compatible shared requests before a queued exclusive request", async () => {
      const releaseShared = Promise.withResolvers<void>();
      const steps: Array<string> = [];

      const firstSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          steps.push("shared-1-start");
          await releaseShared.promise;
          steps.push("shared-1-end");
          return "shared-1";
        },
      );

      const exclusiveRequest = lockManager.request(testName, (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        steps.push("exclusive-start");
        return "exclusive";
      });

      const secondSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          steps.push("shared-2-start");
          return "shared-2";
        },
      );

      await Promise.resolve();

      expect(steps).toEqual(["shared-1-start"]);

      releaseShared.resolve();

      await expect(firstSharedRequest).resolves.toBe("shared-1");
      await expect(exclusiveRequest).resolves.toBe("exclusive");
      await expect(secondSharedRequest).resolves.toBe("shared-2");
      expect(steps).toEqual([
        "shared-1-start",
        "shared-1-end",
        "exclusive-start",
        "shared-2-start",
      ]);
    });

    test("grants compatible shared requests together when no exclusive request blocks them", async () => {
      const releaseShared = Promise.withResolvers<void>();
      const steps: Array<string> = [];

      const firstSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          steps.push("shared-1-start");
          await releaseShared.promise;
          return "shared-1";
        },
      );

      const secondSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          steps.push("shared-2-start");
          await releaseShared.promise;
          return "shared-2";
        },
      );

      await Promise.resolve();

      expect(steps).toEqual(["shared-1-start", "shared-2-start"]);

      releaseShared.resolve();

      await expect(firstSharedRequest).resolves.toBe("shared-1");
      await expect(secondSharedRequest).resolves.toBe("shared-2");
    });

    test("invokes the callback with null asynchronously when ifAvailable cannot grant immediately", async () => {
      const first = Promise.withResolvers<void>();
      let secondCallbackCalled = false;

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        await first.promise;
        return "first";
      });

      const secondRequest = lockManager.request(
        testName,
        { ifAvailable: true },
        (lock) => {
          secondCallbackCalled = true;
          expect(lock).toBeNull();
          return "unavailable";
        },
      );

      expect(secondCallbackCalled).toBe(false);

      await expect(secondRequest).resolves.toBe("unavailable");

      first.resolve();
      await expect(firstRequest).resolves.toBe("first");
    });

    test("grants an exclusive ifAvailable request immediately when the name is free", async () => {
      await expect(
        lockManager.request(testName, { ifAvailable: true }, (lock) => {
          expect(lock).toEqual({ mode: "exclusive", name: testName });
          return "granted";
        }),
      ).resolves.toBe("granted");
    });

    test("invokes the callback with null when ifAvailable sees a queued request", async () => {
      const releaseFirst = Promise.withResolvers<void>();

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        await releaseFirst.promise;
        return "first";
      });

      const queuedRequest = lockManager.request(testName, (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        return "queued";
      });

      const ifAvailableResult = await lockManager.request(
        testName,
        { ifAvailable: true },
        (lock) => {
          expect(lock).toBeNull();
          return "unavailable";
        },
      );

      expect(ifAvailableResult).toBe("unavailable");

      releaseFirst.resolve();
      await expect(firstRequest).resolves.toBe("first");
      await expect(queuedRequest).resolves.toBe("queued");
    });

    test("grants a shared ifAvailable request when shared locks already hold the name", async () => {
      const releaseShared = Promise.withResolvers<void>();

      const firstSharedRequest = lockManager.request(
        testName,
        { mode: "shared" },
        async (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          await releaseShared.promise;
          return "shared-1";
        },
      );

      const secondSharedResult = await lockManager.request(
        testName,
        { ifAvailable: true, mode: "shared" },
        (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          return "shared-2";
        },
      );

      expect(secondSharedResult).toBe("shared-2");

      releaseShared.resolve();
      await expect(firstSharedRequest).resolves.toBe("shared-1");
    });

    test("rejects with the abort reason when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(
        new DOMException("The request was aborted.", "AbortError"),
      );

      await expect(
        lockManager.request(
          testName,
          { signal: controller.signal },
          () => "unreachable",
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    test("rejects a queued request when its signal aborts before grant", async () => {
      const releaseFirst = Promise.withResolvers<void>();
      const controller = new AbortController();

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
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

      await expect(secondRequest).rejects.toMatchObject({ name: "AbortError" });

      releaseFirst.resolve();
      await expect(firstRequest).resolves.toBe("first");
      await expect(lockManager.query()).resolves.toEqual({
        held: [],
        pending: [],
      });
    });

    test("does not invoke the callback when the signal aborts after grant but before callback starts", async () => {
      const controller = new AbortController();
      let callbackCalled = false;

      const request = lockManager.request(
        testName,
        { signal: controller.signal },
        (lock) => {
          callbackCalled = true;
          expect(lock).toEqual({ mode: "exclusive", name: testName });
          return "granted";
        },
      );

      controller.abort(
        new DOMException("The request was aborted.", "AbortError"),
      );

      await expect(request).rejects.toMatchObject({ name: "AbortError" });
      expect(callbackCalled).toBe(false);

      await expect(
        lockManager.request(testName, (lock) => {
          expect(lock).toEqual({ mode: "exclusive", name: testName });
          return "next";
        }),
      ).resolves.toBe("next");
    });

    test("ignores signal aborts after the lock has been granted", async () => {
      const controller = new AbortController();

      const result = await lockManager.request(
        testName,
        { signal: controller.signal },
        (lock) => {
          expect(lock).toEqual({ mode: "exclusive", name: testName });
          controller.abort(
            new DOMException("The request was aborted.", "AbortError"),
          );
          return "granted";
        },
      );

      expect(result).toBe("granted");
    });

    test("releases the lock when the callback throws", async () => {
      const error = new Error("boom");

      const firstRequest = lockManager.request(testName, () => {
        throw error;
      });

      const secondRequest = lockManager.request(testName, (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        return "second";
      });

      await expect(firstRequest).rejects.toBe(error);
      await expect(secondRequest).resolves.toBe("second");
    });

    test("rejects names starting with a hyphen", async () => {
      await expect(
        lockManager.request("-reserved", () => "unreachable"),
      ).rejects.toMatchObject({ name: "NotSupportedError" });
    });

    test("rejects using ifAvailable together with steal", async () => {
      await expect(
        lockManager.request(
          testName,
          { ifAvailable: true, steal: true },
          () => "unreachable",
        ),
      ).rejects.toMatchObject({ name: "NotSupportedError" });
    });

    test("rejects using steal with shared mode", async () => {
      await expect(
        lockManager.request(
          testName,
          { mode: "shared", steal: true },
          () => "unreachable",
        ),
      ).rejects.toMatchObject({ name: "NotSupportedError" });
    });

    test("rejects using signal with ifAvailable", async () => {
      const controller = new AbortController();

      await expect(
        lockManager.request(
          testName,
          { ifAvailable: true, signal: controller.signal },
          () => "unreachable",
        ),
      ).rejects.toMatchObject({ name: "NotSupportedError" });
    });

    test("rejects using signal with steal", async () => {
      const controller = new AbortController();

      await expect(
        lockManager.request(
          testName,
          { signal: controller.signal, steal: true },
          () => "unreachable",
        ),
      ).rejects.toMatchObject({ name: "NotSupportedError" });
    });

    test("steal preempts held and queued requests for the same name", async () => {
      const releaseFirst = Promise.withResolvers<void>();
      const steps: Array<string> = [];

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
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
          expect(lock).toEqual({ mode: "exclusive", name: testName });
          steps.push("steal-start");
          return "steal";
        },
      );

      await expect(firstRequest).rejects.toMatchObject({ name: "AbortError" });
      await expect(stolenRequest).resolves.toBe("steal");

      expect(steps).toEqual(["first-start", "steal-start", "queued-start"]);

      releaseFirst.resolve();

      await expect(queuedRequest).resolves.toBe("queued");
      expect(steps).toEqual([
        "first-start",
        "steal-start",
        "queued-start",
        "first-end",
      ]);
    });

    test("steal behaves like a normal exclusive request when nothing is held", async () => {
      await expect(
        lockManager.request(testName, { steal: true }, (lock) => {
          expect(lock).toEqual({ mode: "exclusive", name: testName });
          return "steal";
        }),
      ).resolves.toBe("steal");
    });
  });

  describe("query", () => {
    test("returns held and pending arrays in the snapshot", async () => {
      const releaseLock = Promise.withResolvers<void>();

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        await releaseLock.promise;
      });

      const secondRequest = lockManager.request(testName, () => undefined);

      await Promise.resolve();

      await expect(lockManager.query()).resolves.toEqual({
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

      await expect(lockManager.query()).resolves.toEqual({
        held: [],
        pending: [],
      });
    });

    test("preserves pending request order for the same resource", async () => {
      const releaseLock = Promise.withResolvers<void>();

      const firstRequest = lockManager.request(testName, async (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        await releaseLock.promise;
      });

      const secondRequest = lockManager.request(
        testName,
        { mode: "shared" },
        (lock) => {
          expect(lock).toEqual({ mode: "shared", name: testName });
          return "second";
        },
      );

      const thirdRequest = lockManager.request(testName, (lock) => {
        expect(lock).toEqual({ mode: "exclusive", name: testName });
        return "third";
      });

      await Promise.resolve();

      await expect(lockManager.query()).resolves.toEqual({
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
      await expect(firstRequest).resolves.toBeUndefined();
      await expect(secondRequest).resolves.toBe("second");
      await expect(thirdRequest).resolves.toBe("third");
    });
  });
});
