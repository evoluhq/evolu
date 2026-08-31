import { describe, it } from "node:test";
import { assertEqual } from "./Assert.ts";

import { createRef } from "./Ref.ts";

describe("Ref", () => {
  describe("get", () => {
    it("returns initial value", () => {
      const ref = createRef(42);
      assertEqual(ref.get(), 42);
    });
  });

  describe("set", () => {
    it("updates value", () => {
      const ref = createRef(0);
      ref.set(1);
      assertEqual(ref.get(), 1);
    });

    it("accepts a value equal to the current value", () => {
      const ref = createRef(1);
      ref.set(1);
      assertEqual(ref.get(), 1);
    });
  });

  describe("getAndSet", () => {
    it("returns previous value and updates value", () => {
      const ref = createRef(1);

      assertEqual(ref.getAndSet(2), 1);
      assertEqual(ref.get(), 2);
    });

    it("accepts a value equal to the current value", () => {
      const ref = createRef(1);

      assertEqual(ref.getAndSet(1), 1);
      assertEqual(ref.get(), 1);
    });
  });

  describe("setAndGet", () => {
    it("returns updated value", () => {
      const ref = createRef(1);

      assertEqual(ref.setAndGet(2), 2);
      assertEqual(ref.get(), 2);
    });

    it("accepts a value equal to the current value", () => {
      const ref = createRef(1);

      assertEqual(ref.setAndGet(1), 1);
      assertEqual(ref.get(), 1);
    });
  });

  describe("update", () => {
    it("updates value", () => {
      const ref = createRef(1);

      ref.update((n) => n + 1);

      assertEqual(ref.get(), 2);
    });

    it("can keep the same value", () => {
      const ref = createRef(1);

      ref.update((n) => n);

      assertEqual(ref.get(), 1);
    });
  });

  describe("getAndUpdate", () => {
    it("returns previous value and updates value", () => {
      const ref = createRef(1);

      assertEqual(
        ref.getAndUpdate((n) => n + 1),
        1,
      );
      assertEqual(ref.get(), 2);
    });

    it("accepts an identity updater", () => {
      const ref = createRef(1);

      assertEqual(
        ref.getAndUpdate((n) => n),
        1,
      );
      assertEqual(ref.get(), 1);
    });
  });

  describe("updateAndGet", () => {
    it("returns updated value", () => {
      const ref = createRef(1);

      assertEqual(
        ref.updateAndGet((n) => n + 1),
        2,
      );
      assertEqual(ref.get(), 2);
    });

    it("accepts an identity updater", () => {
      const ref = createRef(1);

      assertEqual(
        ref.updateAndGet((n) => n),
        1,
      );
      assertEqual(ref.get(), 1);
    });
  });

  describe("modify", () => {
    it("returns a computed result and updates value", () => {
      const ref = createRef(0);
      const result = ref.modify((current) => [current, current + 1]);

      assertEqual(result, 0);
      assertEqual(ref.get(), 1);
    });

    it("can keep the same value while returning a result", () => {
      const ref = createRef(1);
      const result = ref.modify((current) => [`current:${current}`, current]);

      assertEqual(result, "current:1");
      assertEqual(ref.get(), 1);
    });
  });
});
