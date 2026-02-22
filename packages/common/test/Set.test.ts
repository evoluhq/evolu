import { describe, expect, expectTypeOf, test } from "vitest";
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
} from "../src/Set.js";

describe("Constants", () => {
  describe("emptySet", () => {
    test("is empty", () => {
      expect(emptySet.size).toBe(0);
    });

    test("is assignable to any ReadonlySet<T>", () => {
      const numbers: ReadonlySet<number> = emptySet;
      const objects: ReadonlySet<{ id: number }> = emptySet;

      expectTypeOf(numbers).toEqualTypeOf<ReadonlySet<number>>();
      expectTypeOf(objects).toEqualTypeOf<ReadonlySet<{ id: number }>>();

      expect(numbers.size).toBe(0);
      expect(objects.size).toBe(0);
    });

    test("enables fast empty check via reference equality", () => {
      const children: ReadonlySet<number> = emptySet;
      expect(children === emptySet).toBe(true);

      const nonEmpty = addToSet(emptySet, 1);
      expect((nonEmpty as ReadonlySet<number>) === emptySet).toBe(false);
    });
  });
});

describe("Type guards", () => {
  describe("isNonEmptySet", () => {
    test("returns true for non-empty set", () => {
      const set = new Set([1, 2, 3]);
      expect(isNonEmptySet(set)).toBe(true);
    });

    test("returns false for empty set", () => {
      const set = new Set<number>();
      expect(isNonEmptySet(set)).toBe(false);
    });

    test("returns true for single element set", () => {
      const set = new Set([1]);
      expect(isNonEmptySet(set)).toBe(true);
    });

    test("narrows mutable set to NonEmptyReadonlySet", () => {
      const set = new Set<number>([1, 2, 3]);
      if (isNonEmptySet(set)) {
        // Mutable set intersected with branded readonly type
        expectTypeOf(set).toExtend<NonEmptyReadonlySet<number>>();
      }
    });

    test("narrows readonly set to NonEmptyReadonlySet", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      if (isNonEmptySet(set)) {
        expectTypeOf(set).toEqualTypeOf<NonEmptyReadonlySet<number>>();
      }
    });

    test("returns false for empty readonly set", () => {
      const set: ReadonlySet<number> = new Set();
      expect(isNonEmptySet(set)).toBe(false);
    });
  });
});

describe("Transformations", () => {
  describe("createSet", () => {
    test("creates empty set from empty array", () => {
      const result = createSet([] as ReadonlyArray<number>);
      expect(result).toEqual(new Set());
      expectTypeOf(result).toEqualTypeOf<ReadonlySet<number>>();
    });

    test("creates non-empty set from non-empty array", () => {
      const result = createSet([1, 2, 3] as const);
      expect(result).toEqual(new Set([1, 2, 3]));
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlySet<1 | 2 | 3>>();
    });

    test("deduplicates duplicate values", () => {
      const result = createSet([1, 1, 2, 2, 3]);
      expect(result).toEqual(new Set([1, 2, 3]));
    });

    test("returns new set instance each call", () => {
      const a = createSet([1, 2, 3]);
      const b = createSet([1, 2, 3]);
      expect(a).not.toBe(b);
    });
  });

  describe("addToSet", () => {
    test("adds item to empty set", () => {
      const set: ReadonlySet<number> = new Set();
      const result = addToSet(set, 1);
      expect(result).toEqual(new Set([1]));
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlySet<number>>();
    });

    test("adds item to non-empty set", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      const result = addToSet(set, 3);
      expect(result).toEqual(new Set([1, 2, 3]));
    });

    test("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      addToSet(set, 3);
      expect(set).toEqual(new Set([1, 2]));
    });

    test("returns new reference even when item already exists", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      const result = addToSet(set, 2);
      expect(result).toEqual(new Set([1, 2]));
      expect(result).not.toBe(set);
    });

    test("accepts mutable set and returns readonly", () => {
      const mutableSet = new Set<number>([1, 2]);
      const result = addToSet(mutableSet, 3);
      expect(result).toEqual(new Set([1, 2, 3]));
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlySet<number>>();
      expect(mutableSet).toEqual(new Set([1, 2]));
    });
  });

  describe("deleteFromSet", () => {
    test("removes item from set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      const result = deleteFromSet(set, 2);
      expect(result).toEqual(new Set([1, 3]));
      expectTypeOf(result).toEqualTypeOf<ReadonlySet<number>>();
    });

    test("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      deleteFromSet(set, 2);
      expect(set).toEqual(new Set([1, 2, 3]));
    });

    test("returns new reference even when item does not exist", () => {
      const set: ReadonlySet<number> = new Set([1, 2]);
      const result = deleteFromSet(set, 5);
      expect(result).toEqual(new Set([1, 2]));
      expect(result).not.toBe(set);
    });

    test("can delete to empty set", () => {
      const set: ReadonlySet<number> = new Set([1]);
      const result = deleteFromSet(set, 1);
      expect(result.size).toBe(0);
    });

    test("accepts mutable set and returns readonly", () => {
      const mutableSet = new Set<number>([1, 2, 3]);
      const result = deleteFromSet(mutableSet, 2);
      expect(result).toEqual(new Set([1, 3]));
      expectTypeOf(result).toEqualTypeOf<ReadonlySet<number>>();
      expect(mutableSet).toEqual(new Set([1, 2, 3]));
    });
  });

  describe("mapSet", () => {
    test("maps set values", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      const result = mapSet(set, (item) => item * 2);
      expect(result).toEqual(new Set([2, 4, 6]));
      expectTypeOf(result).toEqualTypeOf<ReadonlySet<number>>();
    });

    test("deduplicates mapped duplicates", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      const result = mapSet(set, (item) => item % 2);
      expect(result).toEqual(new Set([1, 0]));
    });

    test("preserves non-empty type for non-empty input", () => {
      const set = addToSet(emptySet, 1);
      const result = mapSet(set, (item) => item.toString());
      expectTypeOf(result).toEqualTypeOf<NonEmptyReadonlySet<string>>();
      expect(result).toEqual(new Set(["1"]));
    });

    test("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      mapSet(set, (item) => item + 1);
      expect(set).toEqual(new Set([1, 2, 3]));
    });
  });

  describe("filterSet", () => {
    test("filters set values with predicate", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3, 4]);
      const result = filterSet(set, (item) => item % 2 === 0);
      expect(result).toEqual(new Set([2, 4]));
      expectTypeOf(result).toEqualTypeOf<ReadonlySet<number>>();
    });

    test("passes index to predicate", () => {
      const set: ReadonlySet<number> = new Set([10, 20, 30]);
      const result = filterSet(set, (_item, index) => index % 2 === 0);
      expect(result).toEqual(new Set([10, 30]));
    });

    test("supports refinement predicates", () => {
      const set: ReadonlySet<string | number> = new Set([1, "a", 2, "b"]);
      const result = filterSet(
        set,
        (item): item is string => typeof item === "string",
      );
      expect(result).toEqual(new Set(["a", "b"]));
      expectTypeOf(result).toEqualTypeOf<ReadonlySet<string>>();
    });

    test("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      filterSet(set, (item) => item > 1);
      expect(set).toEqual(new Set([1, 2, 3]));
    });
  });
});

describe("Accessors", () => {
  describe("firstInSet", () => {
    test("requires NonEmptyReadonlySet (branded type prevents unguarded access)", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      // @ts-expect-error - ReadonlySet is not assignable to NonEmptyReadonlySet
      firstInSet(set);
    });

    test("returns first element by insertion order", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      if (isNonEmptySet(set)) {
        const result = firstInSet(set);
        expect(result).toBe(1);
        expectTypeOf(result).toEqualTypeOf<number>();
      }
    });

    test("returns only element from single element set", () => {
      const set: ReadonlySet<string> = new Set(["only"]);
      if (isNonEmptySet(set)) {
        expect(firstInSet(set)).toBe("only");
      }
    });

    test("does not mutate original set", () => {
      const set: ReadonlySet<number> = new Set([1, 2, 3]);
      if (isNonEmptySet(set)) {
        firstInSet(set);
        expect(set).toEqual(new Set([1, 2, 3]));
      }
    });
  });
});
