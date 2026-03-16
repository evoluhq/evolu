import { describe, expect, test } from "vitest";
import { createStructuralMap } from "../src/StructuralMap.js";

describe("createStructuralMap", () => {
  test("stores and retrieves primitive keys", () => {
    const map = createStructuralMap<number | string | boolean | null, string>();

    map.set("x", "string");
    map.set(1, "number");
    map.set(true, "boolean");
    map.set(false, "boolean-false");
    map.set(null, "null");

    expect(map.size).toBe(5);
    expect(map.get("x")).toBe("string");
    expect(map.get(1)).toBe("number");
    expect(map.get(true)).toBe("boolean");
    expect(map.get(false)).toBe("boolean-false");
    expect(map.get(null)).toBe("null");
    expect(map.has("missing")).toBe(false);
    expect(map.delete("missing")).toBe(false);
  });

  test("treats equal numbers with JSON-like semantics", () => {
    const map = createStructuralMap<number, string>();

    map.set(-0, "zero");
    map.set(NaN, "nan");
    map.set(Number.POSITIVE_INFINITY, "infinity");
    map.set(Number.NEGATIVE_INFINITY, "negative-infinity");

    expect(map.get(0)).toBe("zero");
    expect(map.get(-0)).toBe("zero");
    expect(map.get(NaN)).toBe("nan");
    expect(map.get(Number.POSITIVE_INFINITY)).toBe("infinity");
    expect(map.get(Number.NEGATIVE_INFINITY)).toBe("negative-infinity");
  });

  test("shares entries for structurally equal object keys", () => {
    const map = createStructuralMap<
      { readonly id: string; readonly nested: { readonly enabled: boolean } },
      string
    >();

    map.set({ id: "a", nested: { enabled: true } }, "value");

    expect(map.get({ nested: { enabled: true }, id: "a" })).toBe("value");
    expect(map.size).toBe(1);
  });

  test("shares entries for structurally equal array keys", () => {
    const map = createStructuralMap<
      readonly [string, { readonly count: number }],
      string
    >();

    map.set(["a", { count: 1 }], "value");

    expect(map.get(["a", { count: 1 }])).toBe("value");
    expect(map.has(["a", { count: 2 }])).toBe(false);
  });

  test("shares entries for equal Uint8Array keys", () => {
    const map = createStructuralMap<Uint8Array, string>();

    map.set(new Uint8Array([1, 2, 3]), "value");

    expect(map.get(new Uint8Array([1, 2, 3]))).toBe("value");
    expect(map.has(new Uint8Array([1, 2, 4]))).toBe(false);
    expect(map.size).toBe(1);
  });

  test("shares entries for structurally equal keys containing Uint8Array", () => {
    const map = createStructuralMap<
      {
        readonly id: string;
        readonly bytes: Uint8Array;
      },
      string
    >();

    map.set({ id: "a", bytes: new Uint8Array([1, 2, 3]) }, "value");

    expect(map.get({ bytes: new Uint8Array([1, 2, 3]), id: "a" })).toBe(
      "value",
    );
    expect(
      map.get({ bytes: new Uint8Array([1, 2, 4]), id: "a" }),
    ).toBeUndefined();
  });

  test("supports iteration and forEach", () => {
    const map = createStructuralMap<string | { readonly id: string }, number>();

    map.set("a", 1);
    map.set({ id: "b" }, 2);

    expect(Array.from(map.keys())).toEqual(["a", { id: "b" }]);
    expect(Array.from(map.values())).toEqual([1, 2]);
    expect(Array.from(map.entries())).toEqual([
      ["a", 1],
      [{ id: "b" }, 2],
    ]);
    expect(Array.from(map)).toEqual([
      ["a", 1],
      [{ id: "b" }, 2],
    ]);

    const entries: Array<readonly [string | { readonly id: string }, number]> =
      [];
    map.forEach((value, key) => {
      entries.push([key, value]);
    });

    expect(entries).toEqual([
      ["a", 1],
      [{ id: "b" }, 2],
    ]);
  });

  test("deletes and clears entries using structural equality", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();

    map.set({ id: "a" }, "value");

    expect(map.delete({ id: "a" })).toBe(true);
    expect(map.size).toBe(0);

    map.set({ id: "b" }, "next");
    map.clear();

    expect(map.size).toBe(0);
    expect(map.get({ id: "b" })).toBeUndefined();
  });

  test("reuses cached structural ids for repeated object lookups", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();
    const key = { id: "a" } as const;

    map.set(key, "value");

    expect(map.get(key)).toBe("value");
    expect(map.has(key)).toBe(true);
  });

  test("rejects keys containing undefined", () => {
    const map = createStructuralMap<string, string>();

    expect(() =>
      map.set({ ok: true, bad: undefined } as never, "value"),
    ).toThrow("Structural keys must not contain undefined.");
  });

  test("rejects cyclic keys", () => {
    const map = createStructuralMap<string, string>();
    const key: Record<string, unknown> = { id: "a" };
    key.self = key;

    expect(() => map.set(key as never, "value")).toThrow(
      "Structural keys must not contain cycles.",
    );
  });

  test("supports null-prototype object keys", () => {
    const map = createStructuralMap<{ readonly id: string }, string>();
    const key = Object.assign(Object.create(null), { id: "a" }) as {
      readonly id: string;
    };

    map.set(key, "value");

    expect(map.get({ id: "a" })).toBe("value");
  });

  test("rejects keys outside JSON-like values and Uint8Array", () => {
    const map = createStructuralMap<string, string>();

    expect(() => map.set((() => undefined) as never, "value")).toThrow(
      "Structural keys must be JSON-like values or Uint8Array.",
    );
  });
});
