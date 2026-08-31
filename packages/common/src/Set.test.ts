import { describe, it } from "node:test";
import { assertEqual, assertFalse, assertTrue } from "./Assert.ts";

import {
  addToSet,
  createSet,
  deleteFromSet,
  emptySet,
  filterSet,
  firstInSet,
  isNonEmptySet,
  mapSet,
  type NonEmptyReadonlySet,
} from "./Set.ts";
import { assertType } from "./Type.ts";

describe("Constants", () => {
  describe("emptySet", () => {
    it("is empty", () => {
      assertEqual(emptySet.size, 0);
    });

    it("is assignable to any ReadonlySet<T>", () => {
      const numbers: ReadonlySet<number> = emptySet;
      const objects: ReadonlySet<{ id: number }> = emptySet;

      assertType<typeof numbers, ReadonlySet<number>>();
      assertType<typeof objects, ReadonlySet<{ id: number }>>();

      assertEqual(numbers.size, 0);
      assertEqual(objects.size, 0);
    });

    it("enables fast empty check via reference equality", () => {
      const children: ReadonlySet<number> = emptySet;
      assertTrue(children === emptySet);

      const nonEmpty = addToSet(emptySet, 1);
      assertFalse((nonEmpty as ReadonlySet<number>) === emptySet);
    });
  });
});

describe("Type guards", () => {
  describe("isNonEmptySet", () => {
    it("returns true for non-empty set", () => {
      const set = new Set([1, 2, 3]);
      assertTrue(isNonEmptySet(set));
    });

    it("returns false for empty set", () => {
      const set = new Set<number>();
      assertFalse(isNonEmptySet(set));
    });

    it("returns true for single element set", () => {
      const set = new Set([1]);
      assertTrue(isNonEmptySet(set));
    });

    it("narrows mutable set to NonEmptyReadonlySet", () => {
      const set = new Set<number>([1, 2, 3]);
      if (isNonEmptySet(set)) {
        // Mutable set intersected with branded readonly type
        assertType<
          typeof set extends NonEmptyReadonlySet<number> ? true : false,
          true
        >();
      }
    });

    it("narrows readonly set to NonEmptyReadonlySet", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      if (isNonEmptySet(set)) {
        assertType<typeof set, NonEmptyReadonlySet<number>>();
      }
    });

    it("returns false for empty readonly set", () => {
      const set: ReadonlySet<number> = new Set();
      assertFalse(isNonEmptySet(set));
    });
  });
});

describe("Transformations", () => {
  describe("createSet", () => {
    it("creates empty set from empty array", () => {
      const result = createSet([] as ReadonlyArray<number>);
      assertEqual(result, new Set());
      assertType<
        typeof result extends ReadonlySet<number> ? true : false,
        true
      >();
    });

    it("creates non-empty set from non-empty array", () => {
      const result = createSet([1, 2, 3] as const);
      assertEqual(result, new Set([1, 2, 3]));
      assertType<typeof result, NonEmptyReadonlySet<1 | 2 | 3>>();
    });

    it("deduplicates duplicate values", () => {
      const result = createSet([1, 1, 2, 2, 3]);
      assertEqual(result, new Set([1, 2, 3]));
    });

    it("returns new set instance each call", () => {
      const a = createSet([1, 2, 3]);
      const b = createSet([1, 2, 3]);
      assertFalse(globalThis.Object.is(a, b));
    });
  });

  describe("addToSet", () => {
    it("adds item to empty set", () => {
      const set: ReadonlySet<number> = new Set();
      const result = addToSet(set, 1);
      assertEqual(result, new Set([1]));
      assertType<typeof result, NonEmptyReadonlySet<number>>();
    });

    it("adds item to non-empty set", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      const result = addToSet(set, 3);
      assertEqual(result, new Set([1, 2, 3]));
    });

    it("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      addToSet(set, 3);
      assertEqual(set, new Set([1, 2]));
    });

    it("returns new reference even when item already exists", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      const result = addToSet(set, 2);
      assertEqual(result, new Set([1, 2]));
      assertFalse(globalThis.Object.is(result, set));
    });

    it("accepts mutable set and returns readonly", () => {
      const mutableSet = new Set<number>([1, 2]);
      const result = addToSet(mutableSet, 3);
      assertEqual(result, new Set([1, 2, 3]));
      assertType<typeof result, NonEmptyReadonlySet<number>>();
      assertEqual(mutableSet, new Set([1, 2]));
    });
  });

  describe("deleteFromSet", () => {
    it("removes item from set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      const result = deleteFromSet(set, 2);
      assertEqual(result, new Set([1, 3]));
      assertType<typeof result, ReadonlySet<number>>();
    });

    it("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      deleteFromSet(set, 2);
      assertEqual(set, new Set([1, 2, 3]));
    });

    it("returns new reference even when item does not exist", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      const result = deleteFromSet(set, 5);
      assertEqual(result, new Set([1, 2]));
      assertFalse(globalThis.Object.is(result, set));
    });

    it("can delete to empty set", () => {
      const set: ReadonlySet<number> = new Set([1]);
      const result = deleteFromSet(set, 1);
      assertEqual(result.size, 0);
    });

    it("accepts mutable set and returns readonly", () => {
      const mutableSet = new Set<number>([1, 2, 3]);
      const result = deleteFromSet(mutableSet, 2);
      assertEqual(result, new Set([1, 3]));
      assertType<typeof result, ReadonlySet<number>>();
      assertEqual(mutableSet, new Set([1, 2, 3]));
    });
  });

  describe("mapSet", () => {
    it("maps set values", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      const result = mapSet(set, (item) => item * 2);
      assertEqual(result, new Set([2, 4, 6]));
      assertType<typeof result, ReadonlySet<number>>();
    });

    it("deduplicates mapped duplicates", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      const result = mapSet(set, (item) => item % 2);
      assertEqual(result, new Set([1, 0]));
    });

    it("preserves non-empty type for non-empty input", () => {
      const set = addToSet(emptySet, 1);
      const result = mapSet(set, (item) => item.toString());
      assertType<typeof result, NonEmptyReadonlySet<string>>();
      assertEqual(result, new Set(["1"]));
    });

    it("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      mapSet(set, (item) => item + 1);
      assertEqual(set, new Set([1, 2, 3]));
    });
  });

  describe("filterSet", () => {
    it("filters set values with predicate", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3, 4]);
      const result = filterSet(set, (item) => item % 2 === 0);
      assertEqual(result, new Set([2, 4]));
      assertType<typeof result, ReadonlySet<number>>();
    });

    it("passes index to predicate", () => {
      const set: ReadonlySet<number> = new Set([10, 20, 30]);
      const result = filterSet(set, (_item, index) => index % 2 === 0);
      assertEqual(result, new Set([10, 30]));
    });

    it("supports refinement predicates", () => {
      const set: ReadonlySet<string | number> = new Set([1, "a", 2, "b"]);
      const result = filterSet(
        set,
        (item): item is string => typeof item === "string",
      );
      assertEqual(result, new Set(["a", "b"]));
      assertType<typeof result, ReadonlySet<string>>();
    });

    it("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      filterSet(set, (item) => item > 1);
      assertEqual(set, new Set([1, 2, 3]));
    });
  });
});

describe("Accessors", () => {
  describe("firstInSet", () => {
    it("requires NonEmptyReadonlySet (branded type prevents unguarded access)", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      // @ts-expect-error - ReadonlySet is not assignable to NonEmptyReadonlySet
      firstInSet(set);
    });

    it("returns first element by insertion order", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      if (isNonEmptySet(set)) {
        const result = firstInSet(set);
        assertEqual(result, 1);
        assertType<typeof result, number>();
      }
    });

    it("returns only element from single element set", () => {
      const set: ReadonlySet<string> = new Set(["only"]);
      if (isNonEmptySet(set)) {
        assertEqual(firstInSet(set), "only");
      }
    });

    it("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      if (isNonEmptySet(set)) {
        firstInSet(set);
        assertEqual(set, new Set([1, 2, 3]));
      }
    });
  });
});
