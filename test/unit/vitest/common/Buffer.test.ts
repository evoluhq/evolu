import { describe, expect, test, vi } from "vitest";
import {
  BufferError,
  createBuffer,
  decodeJsonValue,
  encodeJsonValue,
} from "../../../../packages/common/src/Buffer.ts";
import {
  JsonValue,
  NonNegativeInt,
} from "../../../../packages/common/src/Type.ts";

const encodeJson = (value: unknown): Uint8Array => {
  const result = JsonValue.fromUnknown(value);
  if (!result.ok) throw new Error("Expected a valid JsonValue test fixture");

  const buffer = createBuffer();
  encodeJsonValue(buffer, result.value);
  return buffer.unwrap();
};

const decodeJson = (bytes: Uint8Array | ReadonlyArray<number>) =>
  decodeJsonValue(createBuffer(bytes));

const float64Bytes = (value: number): Uint8Array => {
  const bytes = new Uint8Array(9);
  bytes[0] = 0xcb;
  new DataView(bytes.buffer).setFloat64(1, value);
  return bytes;
};

const createJsonObject = (length: number): Record<string, number> => {
  const value: Record<string, number> = {};
  for (let index = 0; index < length; index++) value[`k${index}`] = index;
  return value;
};

describe("BufferError", () => {
  test("is an Error with its name and message", () => {
    const error = new BufferError("test error");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BufferError);
    expect(error.name).toBe("BufferError");
    expect(error.message).toBe("test error");
  });
});

describe("Buffer", () => {
  test("extends, shifts, and resets bytes", () => {
    const buffer = createBuffer();

    expect(buffer.getLength()).toBe(0);
    expect(buffer.getCapacity()).toBe(512);
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array(0));

    const a256 = new Uint8Array(256);
    buffer.extend(a256);
    expect(buffer.getLength()).toBe(256);
    expect(buffer.getCapacity()).toBe(512);
    expect(buffer.unwrap()).toStrictEqual(a256);

    buffer.extend(new Uint8Array(512));
    expect(buffer.getLength()).toBe(768);
    expect(buffer.getCapacity()).toBe(1024);

    buffer.extend(buffer.unwrap());
    expect(buffer.getLength()).toBe(1536);
    expect(buffer.getCapacity()).toBe(2048);

    const buffer2 = createBuffer([1]);
    expect(buffer2.unwrap()).toMatchInlineSnapshot(`uint8:[1]`);

    expect(buffer2.shift()).toBe(1);
    expect(buffer2.unwrap()).toMatchInlineSnapshot(`uint8:[]`);

    buffer2.extend([1, 2, 3]);
    expect(buffer2.shiftN(2 as NonNegativeInt)).toMatchInlineSnapshot(
      `uint8:[1,2]`,
    );

    expect(buffer2.unwrap()).toMatchInlineSnapshot(`uint8:[3]`);

    expect(() => buffer2.shiftN(2 as NonNegativeInt)).toThrow(BufferError);
    expect(() => buffer2.shiftN(2 as NonNegativeInt)).toThrow(
      "Buffer parse ended prematurely",
    );

    buffer2.shift();

    expect(() => buffer2.shift()).toThrow(BufferError);
    expect(() => buffer2.shift()).toThrow("Buffer parse ended prematurely");

    expect(buffer2.shiftN(0 as NonNegativeInt)).toStrictEqual(
      new Uint8Array(0),
    );

    buffer2.extend([1]);
    buffer2.reset();
    expect(buffer2.getLength()).toBe(0);
    expect(buffer2.unwrap()).toStrictEqual(new Uint8Array(0));
  });

  test("uses the input length as its initial capacity", () => {
    const buffer = createBuffer(new Uint8Array(300));
    expect(buffer.getLength()).toBe(300);
    // Should match input, not 512
    expect(buffer.getCapacity()).toBe(300);
  });

  test.each([-1, 1.5, globalThis.Infinity, globalThis.NaN])(
    "rejects invalid ArrayLike length %s",
    (length) => {
      const arrayLike: ArrayLike<number> = { length };

      expect(() => createBuffer(arrayLike)).toThrow(BufferError);
      expect(() => createBuffer(arrayLike)).toThrow(
        "arrayLike.length must be a non-negative safe integer.",
      );

      const buffer = createBuffer();
      expect(() => buffer.extend(arrayLike)).toThrow(BufferError);
      expect(() => buffer.extend(arrayLike)).toThrow(
        "arg.length must be a non-negative safe integer.",
      );
    },
  );

  test("rejects an unsafe resulting length", () => {
    const buffer = createBuffer([0]);
    const extend = () =>
      buffer.extend({
        length: globalThis.Number.MAX_SAFE_INTEGER,
      });

    expect(extend).toThrow(BufferError);
    expect(extend).toThrow(
      "Buffer length must be a non-negative safe integer.",
    );
  });

  test("exposes its internal bytes through unwrap", () => {
    const buffer = createBuffer([1, 2, 3]);
    const view = buffer.unwrap();
    view[0] = 99;
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array([99, 2, 3]));
  });

  test("truncates its contents", () => {
    const buffer = createBuffer([1, 2, 3, 4, 5]);
    expect(buffer.getLength()).toBe(5);
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5]));

    buffer.truncate(3 as NonNegativeInt);
    expect(buffer.getLength()).toBe(3);
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array([1, 2, 3]));

    buffer.truncate(0 as NonNegativeInt);
    expect(buffer.getLength()).toBe(0);
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array([]));

    expect(() => {
      buffer.truncate(1 as NonNegativeInt);
    }).toThrow(BufferError);
    expect(() => {
      buffer.truncate(1 as NonNegativeInt);
    }).toThrow("Cannot truncate to a length greater than current");

    buffer.extend([6, 7, 8]);
    expect(buffer.getLength()).toBe(3);
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array([6, 7, 8]));

    buffer.truncate(2 as NonNegativeInt);
    expect(buffer.getLength()).toBe(2);
    expect(buffer.unwrap()).toStrictEqual(new Uint8Array([6, 7]));
  });
});

describe("JSON binary codec", () => {
  test("matches fixed msgpackr 2.0.5 fixtures", () => {
    const fixtures: ReadonlyArray<readonly [unknown, ReadonlyArray<number>]> = [
      [false, [194]],
      [
        { name: "Ada", nested: { ok: true }, values: [1, 2, 3] },
        [
          131, 164, 110, 97, 109, 101, 163, 65, 100, 97, 166, 110, 101, 115,
          116, 101, 100, 129, 162, 111, 107, 195, 166, 118, 97, 108, 117, 101,
          115, 147, 1, 2, 3,
        ],
      ],
    ];

    for (const [value, bytes] of fixtures) {
      expect(encodeJson(value)).toStrictEqual(new Uint8Array(bytes));
      expect(decodeJson(bytes)).toEqual(value);
    }
  });

  test("encodes every integer boundary", () => {
    const fixtures: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [
      [0, [0]],
      [127, [127]],
      [128, [0xcc, 0x80]],
      [255, [0xcc, 0xff]],
      [256, [0xcd, 0x01, 0x00]],
      [65535, [0xcd, 0xff, 0xff]],
      [65536, [0xce, 0x00, 0x01, 0x00, 0x00]],
      [0xffffffff, [0xce, 0xff, 0xff, 0xff, 0xff]],
      [-1, [0xff]],
      [-32, [0xe0]],
      [-33, [0xd0, 0xdf]],
      [-128, [0xd0, 0x80]],
      [-129, [0xd1, 0xff, 0x7f]],
      [-32768, [0xd1, 0x80, 0x00]],
      [-32769, [0xd2, 0xff, 0xff, 0x7f, 0xff]],
      [-2147483648, [0xd2, 0x80, 0x00, 0x00, 0x00]],
    ];

    for (const [value, bytes] of fixtures) {
      expect(encodeJson(value)).toStrictEqual(new Uint8Array(bytes));
      expect(decodeJson(bytes)).toBe(value);
    }
  });

  test("uses float64 for other finite numbers", () => {
    for (const value of [1.25, -2147483649, 0x100000000, Number.MAX_VALUE]) {
      expect(encodeJson(value)).toStrictEqual(float64Bytes(value));
      expect(decodeJson(float64Bytes(value))).toBe(value);
    }

    const negativeZeroBytes = new Uint8Array([0xcb, 0x80, 0, 0, 0, 0, 0, 0, 0]);
    expect(encodeJson(-0)).toStrictEqual(negativeZeroBytes);
    expect(Object.is(decodeJson(negativeZeroBytes), -0)).toBe(true);
  });

  test("decodes finite float32 values", () => {
    expect(decodeJson([0xca, 0x3f, 0xc0, 0, 0])).toBe(1.5);
    expect(Object.is(decodeJson([0xca, 0x80, 0, 0, 0]), -0)).toBe(true);
  });

  test.each([
    { name: "float32 NaN", bytes: [0xca, 0x7f, 0xc0, 0, 0] },
    { name: "positive float32 Infinity", bytes: [0xca, 0x7f, 0x80, 0, 0] },
    { name: "negative float32 Infinity", bytes: [0xca, 0xff, 0x80, 0, 0] },
    {
      name: "float64 NaN",
      bytes: [0xcb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 0],
    },
    {
      name: "positive float64 Infinity",
      bytes: [0xcb, 0x7f, 0xf0, 0, 0, 0, 0, 0, 0],
    },
    {
      name: "negative float64 Infinity",
      bytes: [0xcb, 0xff, 0xf0, 0, 0, 0, 0, 0, 0],
    },
  ])("rejects $name", ({ bytes }) => {
    expect(() => decodeJson(bytes)).toThrow(BufferError);
    expect(() => decodeJson(bytes)).toThrow(
      "A decoded JSON number must be finite.",
    );
  });

  test("encodes strings by UTF-8 byte length", () => {
    expect(encodeJson("")).toStrictEqual(new Uint8Array([0xa0]));
    expect(encodeJson("abc")).toStrictEqual(
      new Uint8Array([0xa3, 0x61, 0x62, 0x63]),
    );
    expect(encodeJson("é€🌍")).toStrictEqual(
      new Uint8Array([
        0xa9, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8c, 0x8d,
      ]),
    );
    expect(encodeJson("é".repeat(16)).subarray(0, 2)).toStrictEqual(
      new Uint8Array([0xd9, 32]),
    );
  });

  test("supports every string header boundary", () => {
    const fixtures: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [
      [31, [0xbf]],
      [32, [0xd9, 32]],
      [255, [0xd9, 255]],
      [256, [0xda, 1, 0]],
      [65535, [0xda, 255, 255]],
      [65536, [0xdb, 0, 1, 0, 0]],
    ];

    for (const [length, header] of fixtures) {
      const value = "a".repeat(length);
      const bytes = encodeJson(value);
      expect(bytes.subarray(0, header.length)).toStrictEqual(
        new Uint8Array(header),
      );
      expect(decodeJson(bytes)).toBe(value);
    }

    const expandedToStr32 = "€".repeat(21846);
    expect(encodeJson(expandedToStr32).subarray(0, 5)).toStrictEqual(
      new Uint8Array([0xdb, 0, 1, 0, 2]),
    );

    const expandedToStr16 = "€".repeat(86);
    const expandedToStr16Bytes = encodeJson(expandedToStr16);
    expect(expandedToStr16Bytes.subarray(0, 3)).toStrictEqual(
      new Uint8Array([0xda, 1, 2]),
    );
    expect(decodeJson(expandedToStr16Bytes)).toBe(expandedToStr16);
  });

  test("decodes every short ASCII length and non-ASCII fallback position", () => {
    for (let length = 0; length < 16; length++) {
      const value = "a".repeat(length);
      expect(decodeJson(encodeJson(value))).toBe(value);
    }

    for (let nonAsciiIndex = 0; nonAsciiIndex < 14; nonAsciiIndex++) {
      const value = `${"a".repeat(nonAsciiIndex)}é${"a".repeat(13 - nonAsciiIndex)}`;
      expect(encodeJson(value)[0]).toBe(0xaf);
      expect(decodeJson(encodeJson(value))).toBe(value);
    }

    expect(() =>
      decodeJson([0xaf, ...Array.from({ length: 14 }, () => 0x61), 0xc2]),
    ).toThrow("Invalid UTF-8 string encoding.");
  });

  // Evolu's MessagePack profile uses WTF-8 for lone surrogates so every
  // JsonValue string round-trips without loss. Other malformed UTF-8 is rejected.
  test("round-trips surrogate pairs and lone surrogates", () => {
    const fixtures: ReadonlyArray<readonly [string, ReadonlyArray<number>]> = [
      ["\uD83C\uDF0D", [0xa4, 0xf0, 0x9f, 0x8c, 0x8d]],
      ["\uD800", [0xa3, 0xed, 0xa0, 0x80]],
      ["\uDFFF", [0xa3, 0xed, 0xbf, 0xbf]],
    ];

    for (const [value, bytes] of fixtures) {
      expect(encodeJson(value)).toStrictEqual(new Uint8Array(bytes));
      expect(decodeJson(bytes)).toBe(value);
    }

    const longValue = `${"a".repeat(64)}\uD800`;
    expect(decodeJson(encodeJson(longValue))).toBe(longValue);
  });

  test.each([
    { name: "a stray UTF-8 continuation byte", bytes: [0xa1, 0x80] },
    { name: "an overlong two-byte UTF-8 sequence", bytes: [0xa2, 0xc0, 0x80] },
    {
      name: "an invalid two-byte UTF-8 continuation",
      bytes: [0xa2, 0xc2, 0x41],
    },
    {
      name: "an overlong three-byte UTF-8 sequence",
      bytes: [0xa3, 0xe0, 0x80, 0x80],
    },
    {
      name: "an invalid three-byte UTF-8 continuation",
      bytes: [0xa3, 0xe1, 0x80, 0x41],
    },
    {
      name: "an overlong four-byte UTF-8 sequence",
      bytes: [0xa4, 0xf0, 0x80, 0x80, 0x80],
    },
    {
      name: "an invalid four-byte UTF-8 continuation",
      bytes: [0xa4, 0xf1, 0x80, 0x80, 0x41],
    },
    {
      name: "a UTF-8 code point above U+10FFFF",
      bytes: [0xa4, 0xf4, 0x90, 0x80, 0x80],
    },
    { name: "UTF-8 leading byte 0xf5", bytes: [0xa1, 0xf5] },
    { name: "UTF-8 leading byte 0xf8", bytes: [0xa1, 0xf8] },
    { name: "UTF-8 leading byte 0xfc", bytes: [0xa1, 0xfc] },
  ])("rejects $name", ({ bytes }) => {
    expect(() => decodeJson(bytes)).toThrow(BufferError);
    expect(() => decodeJson(bytes)).toThrow("Invalid UTF-8 string encoding.");
  });

  test("rejects UTF-8 truncated within string data", () => {
    expect(() => decodeJson([0xa1, 0xc2])).toThrow(
      "Invalid UTF-8 string encoding.",
    );
    expect(() => decodeJson([0xa2, 0xe1, 0x80])).toThrow(
      "Invalid UTF-8 string encoding.",
    );
    expect(() => decodeJson([0xa3, 0xf1, 0x80, 0x80])).toThrow(
      "Invalid UTF-8 string encoding.",
    );
  });

  test("accepts scalar and canonical WTF-8 boundaries", () => {
    expect(decodeJson([0xa3, 0xed, 0x9f, 0xbf])).toBe("\uD7FF");
    expect(decodeJson([0xa3, 0xed, 0xa0, 0x80])).toBe("\uD800");
    expect(decodeJson([0xa4, 0xf4, 0x8f, 0xbf, 0xbf])).toBe("\u{10FFFF}");
  });

  test("supports every array header boundary", () => {
    const fixtures: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [
      [0, [0x90]],
      [15, [0x9f]],
      [16, [0xdc, 0, 16]],
      [65535, [0xdc, 255, 255]],
      [65536, [0xdd, 0, 1, 0, 0]],
    ];

    for (const [length, header] of fixtures) {
      const value = Array.from({ length }, () => null);
      const bytes = encodeJson(value);
      expect(bytes.subarray(0, header.length)).toStrictEqual(
        new Uint8Array(header),
      );
      expect(decodeJson(bytes)).toEqual(value);
    }

    expect(decodeJson(encodeJson([[], [null, [true]]]))).toEqual([
      [],
      [null, [true]],
    ]);
    expect(decodeJson([0xdc, 0, 0])).toEqual([]);
    expect(decodeJson([0xdd, 0, 0, 0, 0])).toEqual([]);
  });

  test("supports every map header boundary", () => {
    const fixtures: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [
      [0, [0x80]],
      [15, [0x8f]],
      [16, [0xde, 0, 16]],
      [65535, [0xde, 255, 255]],
      [65536, [0xdf, 0, 1, 0, 0]],
    ];

    for (const [length, header] of fixtures) {
      const value = createJsonObject(length);
      const bytes = encodeJson(value);
      expect(bytes.subarray(0, header.length)).toStrictEqual(
        new Uint8Array(header),
      );
      expect(decodeJson(bytes)).toEqual(value);
    }

    expect(decodeJson(encodeJson({ nested: { empty: {} } }))).toEqual({
      nested: { empty: {} },
    });
    expect(decodeJson([0xde, 0, 0])).toEqual({});
    expect(decodeJson([0xdf, 0, 0, 0, 0])).toEqual({});
  });

  test("limits JSON nesting consistently", () => {
    const maxDepth = 1_000;
    let value: unknown = null;

    for (let index = 0; index < maxDepth; index++) value = [value];

    const bytes = encodeJson(value);
    let decoded: unknown = decodeJson(bytes);

    for (let index = 0; index < maxDepth; index++) {
      if (!Array.isArray(decoded) || decoded.length !== 1) {
        throw new Error("Expected a single-item nested array.");
      }
      decoded = decoded[0];
    }
    expect(decoded).toBeNull();

    value = [value];
    expect(() => encodeJson(value)).toThrow(
      "JSON nesting exceeds the maximum depth of 1000.",
    );

    const tooDeepArrayBytes = new Uint8Array(maxDepth + 2);
    tooDeepArrayBytes.fill(0x91, 0, maxDepth + 1);
    tooDeepArrayBytes[maxDepth + 1] = 0xc0;
    const tooDeepArrayBuffer = createBuffer(tooDeepArrayBytes);
    expect(() => decodeJsonValue(tooDeepArrayBuffer)).toThrow(
      "JSON nesting exceeds the maximum depth of 1000.",
    );
    expect(tooDeepArrayBuffer.unwrap()).toStrictEqual(tooDeepArrayBytes);

    const tooDeepMapBytes = new Uint8Array((maxDepth + 1) * 3 + 1);
    let position = 0;
    for (let index = 0; index <= maxDepth; index++) {
      tooDeepMapBytes[position++] = 0x81;
      tooDeepMapBytes[position++] = 0xa1;
      tooDeepMapBytes[position++] = 0x76;
    }
    tooDeepMapBytes[position] = 0xc0;
    const tooDeepMapBuffer = createBuffer(tooDeepMapBytes);
    expect(() => decodeJsonValue(tooDeepMapBuffer)).toThrow(
      "JSON nesting exceeds the maximum depth of 1000.",
    );
    expect(tooDeepMapBuffer.unwrap()).toStrictEqual(tooDeepMapBytes);
  });

  test("encodes null-prototype objects", () => {
    const value = Object.assign(
      Object.create(null) as Record<string, unknown>,
      {
        key: "value",
      },
    );
    const decoded = decodeJson(encodeJson(value));

    expect(decoded).toEqual({ key: "value" });
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  });

  test("creates an own __proto__ data property", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.__proto__ = { safe: true };

    const decoded = decodeJson(encodeJson(value));

    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded as object, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(decoded, "__proto__")).toEqual({
      value: { safe: true },
      configurable: true,
      enumerable: true,
      writable: true,
    });
  });

  test("uses the last value for duplicate map keys", () => {
    expect(decodeJson([0x82, 0xa1, 0x61, 1, 0xa1, 0x61, 2])).toEqual({
      a: 2,
    });
    expect(
      decodeJson([
        0x82, 0xa9, 0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f, 1,
        0xa9, 0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f, 2,
      ]),
    ).toHaveProperty("__proto__", 2);
  });

  test("decodes every string header for object keys", () => {
    expect(decodeJson([0x81, 0xd9, 1, 0x61, 1])).toEqual({ a: 1 });
    expect(decodeJson([0x81, 0xda, 0, 1, 0x61, 1])).toEqual({ a: 1 });
    expect(decodeJson([0x81, 0xdb, 0, 0, 0, 1, 0x61, 1])).toEqual({ a: 1 });

    const longKey = "a".repeat(33);
    expect(decodeJson(encodeJson({ [longKey]: 1 }))).toEqual({
      [longKey]: 1,
    });
  });

  test("handles object key cache collisions", () => {
    expect(decodeJson(encodeJson({ "": 0 }))).toEqual({ "": 0 });
    expect(decodeJson(encodeJson({ " ": 1 }))).toEqual({ " ": 1 });
    expect(decodeJson(encodeJson({ abc: 2 }))).toEqual({ abc: 2 });
    expect(decodeJson(encodeJson({ abd: 3 }))).toEqual({ abd: 3 });
    expect(decodeJson(encodeJson({ abc: 4 }))).toEqual({ abc: 4 });
  });

  test("rejects maps with non-string keys", () => {
    expect(() => decodeJson([0x81, 1, 2])).toThrow(BufferError);
    expect(() => decodeJson([0x81, 1, 2])).toThrow(
      "A decoded JSON object key must be a string.",
    );
  });

  test.each(
    [
      0xc1, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xcf, 0xd3, 0xd4, 0xd5, 0xd6,
      0xd7, 0xd8,
    ].map((marker) => ({
      marker,
      name: `0x${marker.toString(16)}`,
    })),
  )("rejects unsupported marker $name", ({ marker }) => {
    expect(() => decodeJson([marker])).toThrow(BufferError);
    expect(() => decodeJson([marker])).toThrow(
      "Unsupported MessagePack marker",
    );
  });

  test.each([
    { name: "empty data", bytes: [] },
    { name: "a truncated uint16 value", bytes: [0xcd, 0] },
    { name: "a truncated uint32 value", bytes: [0xce, 0, 0, 0] },
    { name: "a truncated int16 value", bytes: [0xd1, 0] },
    { name: "a truncated int32 value", bytes: [0xd2, 0, 0, 0] },
    { name: "a truncated float32 value", bytes: [0xca, 0, 0, 0] },
    {
      name: "a truncated float64 value",
      bytes: [0xcb, 0, 0, 0, 0, 0, 0, 0],
    },
    { name: "a truncated str8 header", bytes: [0xd9] },
    { name: "a truncated str16 header", bytes: [0xda, 0] },
    { name: "a truncated str32 header", bytes: [0xdb, 0, 0, 0] },
    { name: "a truncated array16 header", bytes: [0xdc, 0] },
    { name: "a truncated array32 header", bytes: [0xdd, 0, 0, 0] },
    { name: "a truncated map16 header", bytes: [0xde, 0] },
    { name: "a truncated map32 header", bytes: [0xdf, 0, 0, 0] },
    { name: "missing fixstr data", bytes: [0xa1] },
  ])("rejects $name", ({ bytes }) => {
    expect(() => decodeJson(bytes)).toThrow(BufferError);
    expect(() => decodeJson(bytes)).toThrow("Buffer parse ended prematurely");
  });

  test("rejects impossible declared lengths", () => {
    expect(() => decodeJson([0xdd, 0xff, 0xff, 0xff, 0xff])).toThrow(
      "Buffer parse ended prematurely",
    );
    expect(() => decodeJson([0xdf, 0xff, 0xff, 0xff, 0xff])).toThrow(
      "Buffer parse ended prematurely",
    );
    expect(() => decodeJson([0xdb, 0xff, 0xff, 0xff, 0xff])).toThrow(
      "Buffer parse ended prematurely",
    );
    expect(() => decodeJson([0xdc, 0, 2, 0xc0])).toThrow(
      "Buffer parse ended prematurely",
    );
    expect(() => decodeJson([0xde, 0, 1, 0xa0])).toThrow(
      "Buffer parse ended prematurely",
    );
  });

  test("decodes exactly one value at a time", () => {
    const buffer = createBuffer();
    encodeJsonValue(buffer, JsonValue.orThrow({ first: true }));
    encodeJsonValue(buffer, JsonValue.orThrow(["second"]));

    expect(decodeJsonValue(buffer)).toEqual({ first: true });
    expect(decodeJsonValue(buffer)).toEqual(["second"]);
    expect(buffer.getLength()).toBe(0);
  });

  test("leaves the Buffer unchanged after decoding fails", () => {
    const bytes = new Uint8Array([0x92, 1]);
    const buffer = createBuffer(bytes);

    expect(() => decodeJsonValue(buffer)).toThrow(BufferError);
    expect(buffer.unwrap()).toStrictEqual(bytes);
  });

  test("resets reusable encoder state after appending fails", () => {
    const failedBuffer = {
      ...createBuffer(),
      extend: () => {
        throw new BufferError("append failed");
      },
    };

    expect(() =>
      encodeJsonValue(failedBuffer, JsonValue.orThrow("first")),
    ).toThrow("append failed");
    expect(encodeJson("second")).toStrictEqual(
      new Uint8Array([0xa6, 0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64]),
    );
  });

  test("rejects reentrant encoding without corrupting encoder state", () => {
    const reentrantBuffer = {
      ...createBuffer(),
      extend: () => {
        encodeJsonValue(createBuffer(), JsonValue.orThrow("nested"));
      },
    };

    expect(() =>
      encodeJsonValue(reentrantBuffer, JsonValue.orThrow({ a: true })),
    ).toThrow("Reentrant JSON encoding is not supported.");
    expect(encodeJson({ a: true })).toStrictEqual(
      new Uint8Array([0x81, 0xa1, 0x61, 0xc3]),
    );
  });

  test("rejects collection lengths beyond MessagePack uint32", () => {
    const value = {};
    const objectKeys = Object.keys;
    const keysSpy = vi
      .spyOn(Object, "keys")
      .mockImplementation((object: object): Array<string> =>
        object === value
          ? ({ length: 0x100000000 } as unknown as Array<string>)
          : objectKeys(object),
      );

    try {
      expect(() => encodeJson(value)).toThrow(
        "Collection length exceeds the MessagePack uint32 limit.",
      );
    } finally {
      keysSpy.mockRestore();
    }
  });

  test("converts unexpected decoder errors to BufferError", () => {
    const errorBuffer = {
      ...createBuffer([0xc0]),
      shiftN: () => {
        throw new Error("unexpected");
      },
    };
    expect(() => decodeJsonValue(errorBuffer)).toThrow(
      "Invalid MessagePack data",
    );
  });
});
