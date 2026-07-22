import { describe, expect, test } from "vitest";
import { createRef } from "../../../../packages/common/src/Ref.ts";

describe("Ref", () => {
  describe("get", () => {
    test("returns initial value", () => {
      const ref = createRef(42);
      expect(ref.get()).toBe(42);
    });
  });

  describe("set", () => {
    test("updates value", () => {
      const ref = createRef(0);
      ref.set(1);
      expect(ref.get()).toBe(1);
    });

    test("accepts a value equal to the current value", () => {
      const ref = createRef(1);
      ref.set(1);
      expect(ref.get()).toBe(1);
    });
  });

  describe("getAndSet", () => {
    test("returns previous value and updates value", () => {
      const ref = createRef(1);

      expect(ref.getAndSet(2)).toBe(1);
      expect(ref.get()).toBe(2);
    });

    test("accepts a value equal to the current value", () => {
      const ref = createRef(1);

      expect(ref.getAndSet(1)).toBe(1);
      expect(ref.get()).toBe(1);
    });
  });

  describe("setAndGet", () => {
    test("returns updated value", () => {
      const ref = createRef(1);

      expect(ref.setAndGet(2)).toBe(2);
      expect(ref.get()).toBe(2);
    });

    test("accepts a value equal to the current value", () => {
      const ref = createRef(1);

      expect(ref.setAndGet(1)).toBe(1);
      expect(ref.get()).toBe(1);
    });
  });

  describe("update", () => {
    test("updates value", () => {
      const ref = createRef(1);

      ref.update((n) => n + 1);

      expect(ref.get()).toBe(2);
    });

    test("can keep the same value", () => {
      const ref = createRef(1);

      ref.update((n) => n);

      expect(ref.get()).toBe(1);
    });
  });

  describe("getAndUpdate", () => {
    test("returns previous value and updates value", () => {
      const ref = createRef(1);

      expect(ref.getAndUpdate((n) => n + 1)).toBe(1);
      expect(ref.get()).toBe(2);
    });

    test("accepts an identity updater", () => {
      const ref = createRef(1);

      expect(ref.getAndUpdate((n) => n)).toBe(1);
      expect(ref.get()).toBe(1);
    });
  });

  describe("updateAndGet", () => {
    test("returns updated value", () => {
      const ref = createRef(1);

      expect(ref.updateAndGet((n) => n + 1)).toBe(2);
      expect(ref.get()).toBe(2);
    });

    test("accepts an identity updater", () => {
      const ref = createRef(1);

      expect(ref.updateAndGet((n) => n)).toBe(1);
      expect(ref.get()).toBe(1);
    });
  });

  describe("modify", () => {
    test("returns a computed result and updates value", () => {
      const ref = createRef(0);
      const result = ref.modify((current) => [current, current + 1]);

      expect(result).toBe(0);
      expect(ref.get()).toBe(1);
    });

    test("can keep the same value while returning a result", () => {
      const ref = createRef(1);
      const result = ref.modify((current) => [`current:${current}`, current]);

      expect(result).toBe("current:1");
      expect(ref.get()).toBe(1);
    });
  });
});
