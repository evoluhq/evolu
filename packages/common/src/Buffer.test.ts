import { describe, it, mock } from "node:test";
import {
  assertEqual,
  assertEqualBytes,
  assertInstanceOf,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";

import {
  BufferError,
  createBuffer,
  createRunLengthEncoder,
  decodeFlags,
  decodeJsonValue,
  decodeLength,
  decodeNonNegativeInt,
  decodeNumber,
  decodeRle,
  decodeString,
  encodeFlags,
  encodeJsonValue,
  encodeLength,
  encodeNonNegativeInt,
  encodeNumber,
  encodeString,
} from "./Buffer.ts";
import {
  assertType,
  FiniteNumber,
  JsonValue,
  NonNegativeInt,
  Object,
  PositiveInt,
  zeroNonNegativeInt,
} from "./Type.ts";

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
  it("is an Error with its name and message", () => {
    const error = new BufferError("test error");
    assertInstanceOf(error, Error);
    assertInstanceOf(error, BufferError);
    assertEqual(error.name, "BufferError");
    assertEqual(error.message, "test error");
  });
});

describe("Buffer", () => {
  it("extends, shifts, and resets bytes", () => {
    const buffer = createBuffer();

    assertEqual(buffer.getLength(), 0);
    assertEqual(buffer.getCapacity(), 512);
    assertEqualBytes(buffer.unwrap(), []);

    const a256 = new Uint8Array(256);
    buffer.extend(a256);
    assertEqual(buffer.getLength(), 256);
    assertEqual(buffer.getCapacity(), 512);
    assertEqual(buffer.unwrap(), a256);

    buffer.extend(new Uint8Array(512));
    assertEqual(buffer.getLength(), 768);
    assertEqual(buffer.getCapacity(), 1024);

    buffer.extend(buffer.unwrap());
    assertEqual(buffer.getLength(), 1536);
    assertEqual(buffer.getCapacity(), 2048);

    const buffer2 = createBuffer([1]);
    assertEqualBytes(buffer2.unwrap(), [1]);

    assertEqual(buffer2.shift(), 1);
    assertEqualBytes(buffer2.unwrap(), []);

    buffer2.extend([1, 2, 3]);
    assertEqualBytes(buffer2.shiftN(2 as NonNegativeInt), [1, 2]);

    assertEqualBytes(buffer2.unwrap(), [3]);

    {
      const thrown = assertThrowsInstanceOf(
        () => buffer2.shiftN(2 as NonNegativeInt),
        BufferError,
      );

      assertTrue(thrown.message.includes("Buffer parse ended prematurely"));
    }

    buffer2.shift();

    {
      const thrown = assertThrowsInstanceOf(() => buffer2.shift(), BufferError);

      assertTrue(thrown.message.includes("Buffer parse ended prematurely"));
    }

    assertEqualBytes(buffer2.shiftN(0 as NonNegativeInt), []);

    buffer2.extend([1]);
    buffer2.reset();
    assertEqual(buffer2.getLength(), 0);
    assertEqualBytes(buffer2.unwrap(), []);
  });

  it("uses the input length as its initial capacity", () => {
    const buffer = createBuffer(new Uint8Array(300));
    assertEqual(buffer.getLength(), 300);
    // Should match input, not 512
    assertEqual(buffer.getCapacity(), 300);
  });

  for (const length of [-1, 1.5, Infinity, NaN]) {
    it(`rejects invalid ArrayLike length ${length}`, () => {
      const arrayLike: ArrayLike<number> = { length };

      {
        const thrown = assertThrowsInstanceOf(
          () => createBuffer(arrayLike),
          BufferError,
        );

        assertTrue(
          thrown.message.includes(
            "arrayLike.length must be a non-negative safe integer.",
          ),
        );
      }

      const buffer = createBuffer();
      {
        const thrown = assertThrowsInstanceOf(
          () => buffer.extend(arrayLike),
          BufferError,
        );

        assertTrue(
          thrown.message.includes(
            "arg.length must be a non-negative safe integer.",
          ),
        );
      }
    });
  }

  it("rejects an unsafe resulting length", () => {
    const buffer = createBuffer([0]);
    const extend = () =>
      buffer.extend({
        length: Number.MAX_SAFE_INTEGER,
      });

    {
      const thrown = assertThrowsInstanceOf(extend, BufferError);

      assertTrue(
        thrown.message.includes(
          "Buffer length must be a non-negative safe integer.",
        ),
      );
    }
  });

  it("exposes its internal bytes through unwrap", () => {
    const buffer = createBuffer([1, 2, 3]);
    const view = buffer.unwrap();
    view[0] = 99;
    assertEqualBytes(buffer.unwrap(), [99, 2, 3]);
  });

  it("truncates its contents", () => {
    const buffer = createBuffer([1, 2, 3, 4, 5]);
    assertEqual(buffer.getLength(), 5);
    assertEqualBytes(buffer.unwrap(), [1, 2, 3, 4, 5]);

    buffer.truncate(3 as NonNegativeInt);
    assertEqual(buffer.getLength(), 3);
    assertEqualBytes(buffer.unwrap(), [1, 2, 3]);

    buffer.truncate(0 as NonNegativeInt);
    assertEqual(buffer.getLength(), 0);
    assertEqualBytes(buffer.unwrap(), []);

    {
      const thrown = assertThrowsInstanceOf(() => {
        buffer.truncate(1 as NonNegativeInt);
      }, BufferError);

      assertTrue(
        thrown.message.includes(
          "Cannot truncate to a length greater than current",
        ),
      );
    }

    buffer.extend([6, 7, 8]);
    assertEqual(buffer.getLength(), 3);
    assertEqualBytes(buffer.unwrap(), [6, 7, 8]);

    buffer.truncate(2 as NonNegativeInt);
    assertEqual(buffer.getLength(), 2);
    assertEqualBytes(buffer.unwrap(), [6, 7]);
  });
});

describe("number encoding", () => {
  it("encodes and decodes finite numbers", () => {
    const values = [
      FiniteNumber.orThrow(-0),
      FiniteNumber.orThrow(0),
      FiniteNumber.orThrow(42),
      FiniteNumber.orThrow(-123),
      // oxlint-disable-next-line oxc/approx-constant -- Pins this exact decimal's serialized bytes below.
      FiniteNumber.orThrow(3.14159),
      FiniteNumber.orThrow(Number.MAX_SAFE_INTEGER),
      FiniteNumber.orThrow(Number.MIN_SAFE_INTEGER),
    ];

    const buffer = createBuffer();

    for (const value of values) {
      encodeNumber(buffer, value);
      const encoded = createBuffer();
      encodeNumber(encoded, value);
      assertSame(decodeNumber(encoded), value);
      assertEqual(encoded.getLength(), 0);
    }

    assertEqualBytes(
      buffer.unwrap(),
      [
        203, 128, 0, 0, 0, 0, 0, 0, 0, 0, 42, 208, 133, 203, 64, 9, 33, 249,
        240, 27, 134, 110, 203, 67, 63, 255, 255, 255, 255, 255, 255, 203, 195,
        63, 255, 255, 255, 255, 255, 255,
      ],
    );
  });

  // Non-finite numbers indicate an app bug. Evolu prevents them from being
  // stored or synced; this covers legacy data created before that protection.
  it("rejects a non-finite MessagePack number", () => {
    const error = assertThrowsInstanceOf(
      () => decodeNumber(createBuffer([203, 127, 240, 0, 0, 0, 0, 0, 0])),
      BufferError,
    );
    assertEqual(error.message, "A decoded JSON number must be finite.");
  });

  it("rejects a non-number MessagePack value", () => {
    const error = assertThrowsInstanceOf(
      () => decodeNumber(createBuffer([0xc0])),
      BufferError,
    );
    assertEqual(error.message, "Expected an encoded number.");
  });
});

describe("flag encoding", () => {
  it("encodes and decodes up to eight boolean flags", () => {
    const cases: ReadonlyArray<{
      readonly flags: ReadonlyArray<boolean>;
      readonly expected: number;
    }> = [
      { flags: [true], expected: 1 },
      { flags: [false], expected: 0 },
      { flags: [true, false], expected: 1 },
      { flags: [false, true], expected: 2 },
      { flags: [true, true], expected: 3 },
      { flags: [true, false, true, false, true], expected: 0b10101 },
      {
        flags: [true, true, true, true, true, true, true, true],
        expected: 0xff,
      },
    ];

    for (const { flags, expected } of cases) {
      const buffer = createBuffer();
      encodeFlags(buffer, flags);
      assertEqual(buffer.unwrap()[0], expected);

      assertEqual(
        decodeFlags(
          createBuffer(buffer.unwrap()),
          PositiveInt.orThrow(flags.length),
        ),
        flags,
      );
    }

    const buffer = createBuffer();
    encodeFlags(buffer, [true, false, true, false, true, false, true, false]);
    assertEqual(decodeFlags(buffer, PositiveInt.orThrow(9)), [
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});

describe("non-negative integer encoding", () => {
  it("encodes and decodes variable-length integers", () => {
    const cases: ReadonlyArray<{
      readonly input: NonNegativeInt;
      readonly expected: ReadonlyArray<number>;
    }> = [
      { input: 0 as NonNegativeInt, expected: [0] },
      { input: 1 as NonNegativeInt, expected: [1] },
      { input: 127 as NonNegativeInt, expected: [127] },
      { input: 128 as NonNegativeInt, expected: [128, 1] },
      { input: 129 as NonNegativeInt, expected: [129, 1] },
      { input: 255 as NonNegativeInt, expected: [255, 1] },
      { input: 16383 as NonNegativeInt, expected: [255, 127] },
      { input: 16384 as NonNegativeInt, expected: [128, 128, 1] },
      { input: 32767 as NonNegativeInt, expected: [255, 255, 1] },
      { input: 2097151 as NonNegativeInt, expected: [255, 255, 127] },
      { input: 2097152 as NonNegativeInt, expected: [128, 128, 128, 1] },
      {
        input: 268435455 as NonNegativeInt,
        expected: [255, 255, 255, 127],
      },
      {
        input: Number.MAX_SAFE_INTEGER as NonNegativeInt,
        expected: [255, 255, 255, 255, 255, 255, 255, 15],
      },
      {
        input: (Number.MAX_SAFE_INTEGER - 1) as NonNegativeInt,
        expected: [254, 255, 255, 255, 255, 255, 255, 15],
      },
    ];

    for (const { input, expected } of cases) {
      const encoded = createBuffer();
      encodeNonNegativeInt(encoded, input);
      assertEqualBytes(encoded.unwrap(), expected);
      assertEqual(decodeNonNegativeInt(encoded), input);
    }
  });

  it("rejects values outside the non-negative safe integer range", () => {
    const buffer = createBuffer();
    encodeNonNegativeInt(
      buffer,
      (Number.MAX_SAFE_INTEGER + 1) as NonNegativeInt,
    );

    const error = assertThrowsInstanceOf(
      () => decodeNonNegativeInt(buffer),
      BufferError,
    );
    assertEqual(
      error.message,
      "Decoded integer must be a non-negative safe integer.",
    );
  });

  it("rejects input without a terminating byte", () => {
    for (const byte of [0x80, 0xff]) {
      const error = assertThrowsInstanceOf(
        () => decodeNonNegativeInt(createBuffer(new Uint8Array(8).fill(byte))),
        BufferError,
      );
      assertEqual(
        error.message,
        "Variable-length quantity must terminate within 8 bytes.",
      );
    }
  });

  it("rejects truncated input", () => {
    const error = assertThrowsInstanceOf(
      () => decodeNonNegativeInt(createBuffer([128])),
      BufferError,
    );
    assertEqual(error.message, "Buffer parse ended prematurely");
  });
});

describe("length encoding", () => {
  it("encodes and decodes array-like lengths", () => {
    let buffer = createBuffer();
    encodeLength(buffer, []);
    assertEqual(decodeLength(buffer), 0);

    buffer = createBuffer();
    encodeLength(buffer, [1, 2, 3]);
    assertEqual(decodeLength(buffer), 3);
  });
});

describe("string encoding", () => {
  it("encodes and decodes length-prefixed UTF-8", () => {
    const value = "Hello, world!";
    const buffer = createBuffer();
    encodeString(buffer, value);

    assertEqualBytes(
      buffer.unwrap(),
      [13, 72, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33],
    );
    assertEqual(decodeString(buffer), value);
  });
});

describe("run-length encoding", () => {
  it("encodes consecutive equal values", () => {
    const encoder =
      createRunLengthEncoder<NonNegativeInt>(encodeNonNegativeInt);

    encoder.add(5 as NonNegativeInt);
    encoder.add(5 as NonNegativeInt);
    encoder.add(7 as NonNegativeInt);

    assertEqualBytes(encoder.unwrap(), [5, 2, 7, 1]);
    assertEqual(encoder.getLength(), 4);
  });

  it("distinguishes 0 from -0 when grouping runs", () => {
    const encoder = createRunLengthEncoder<FiniteNumber>(encodeNumber);
    encoder.add(FiniteNumber.orThrow(0));
    encoder.add(FiniteNumber.orThrow(-0));

    const buffer = createBuffer(encoder.unwrap());
    const values = decodeRle(buffer, NonNegativeInt.orThrow(2), () =>
      decodeNumber(buffer),
    );

    assertSame(values[0], 0);
    assertSame(values[1], -0);
  });

  it("decodes a valid numeric run", () => {
    const buffer = createBuffer();
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(5));
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(3));

    assertEqual(
      decodeRle(buffer, NonNegativeInt.orThrow(3), () =>
        decodeNonNegativeInt(buffer),
      ),
      [5, 5, 5],
    );
    assertEqual(buffer.getLength(), 0);
  });

  it("supports non-integer values", () => {
    const buffer = createBuffer();
    encodeString(buffer, "value");
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(3));

    assertEqual(
      decodeRle(buffer, NonNegativeInt.orThrow(3), () => decodeString(buffer)),
      ["value", "value", "value"],
    );
    assertEqual(buffer.getLength(), 0);
  });

  it("rejects a run length exceeding the remaining output length", () => {
    const buffer = createBuffer();
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(1));
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(100000));

    const error = assertThrowsInstanceOf(
      () =>
        decodeRle(buffer, NonNegativeInt.orThrow(2), () =>
          decodeNonNegativeInt(buffer),
        ),
      BufferError,
    );
    assertEqual(
      error.message,
      "Invalid RLE encoding: runLength 100000 exceeds remaining 2",
    );
  });

  it("rejects a zero run length", () => {
    const buffer = createBuffer();
    encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(1));
    encodeNonNegativeInt(buffer, zeroNonNegativeInt);

    const error = assertThrowsInstanceOf(
      () =>
        decodeRle(buffer, NonNegativeInt.orThrow(1), () =>
          decodeNonNegativeInt(buffer),
        ),
      BufferError,
    );
    assertEqual(
      error.message,
      "Invalid RLE encoding: runLength must be positive",
    );
  });
});

describe("JSON binary codec", () => {
  it("matches fixed msgpackr 2.0.5 fixtures", () => {
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
      assertEqualBytes(encodeJson(value), bytes);
      assertEqual(decodeJson(bytes), value);
    }
  });

  it("encodes every integer boundary", () => {
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
      assertEqualBytes(encodeJson(value), bytes);
      assertSame(decodeJson(bytes), value);
    }
  });

  it("uses float64 for other finite numbers", () => {
    for (const value of [1.25, -2147483649, 0x100000000, Number.MAX_VALUE]) {
      assertEqual(encodeJson(value), float64Bytes(value));
      assertSame(decodeJson(float64Bytes(value)), value);
    }

    const negativeZeroBytes = new Uint8Array([0xcb, 0x80, 0, 0, 0, 0, 0, 0, 0]);
    assertEqual(encodeJson(-0), negativeZeroBytes);
    assertSame(decodeJson(negativeZeroBytes), -0);
  });

  it("decodes finite float32 values", () => {
    assertEqual(decodeJson([0xca, 0x3f, 0xc0, 0, 0]), 1.5);
    assertSame(decodeJson([0xca, 0x80, 0, 0, 0]), -0);
  });

  for (const { name, bytes } of [
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
  ]) {
    it(`rejects ${name}`, () => {
      {
        const thrown = assertThrowsInstanceOf(
          () => decodeJson(bytes),
          BufferError,
        );

        assertTrue(
          thrown.message.includes("A decoded JSON number must be finite."),
        );
      }
    });
  }

  it("encodes strings by UTF-8 byte length", () => {
    assertEqualBytes(encodeJson(""), [0xa0]);
    assertEqualBytes(encodeJson("abc"), [0xa3, 0x61, 0x62, 0x63]);
    assertEqualBytes(
      encodeJson("é€🌍"),
      [0xa9, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8c, 0x8d],
    );
    assertEqualBytes(encodeJson("é".repeat(16)).subarray(0, 2), [0xd9, 32]);
  });

  it("supports every string header boundary", () => {
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
      assertEqualBytes(bytes.subarray(0, header.length), header);
      assertSame(decodeJson(bytes), value);
    }

    const expandedToStr32 = "€".repeat(21846);
    assertEqualBytes(
      encodeJson(expandedToStr32).subarray(0, 5),
      [0xdb, 0, 1, 0, 2],
    );

    const expandedToStr16 = "€".repeat(86);
    const expandedToStr16Bytes = encodeJson(expandedToStr16);
    assertEqualBytes(expandedToStr16Bytes.subarray(0, 3), [0xda, 1, 2]);
    assertSame(decodeJson(expandedToStr16Bytes), expandedToStr16);
  });

  it("decodes every short ASCII length and non-ASCII fallback position", () => {
    for (let length = 0; length < 16; length++) {
      const value = "a".repeat(length);
      assertSame(decodeJson(encodeJson(value)), value);
    }

    for (let nonAsciiIndex = 0; nonAsciiIndex < 14; nonAsciiIndex++) {
      const value = `${"a".repeat(nonAsciiIndex)}é${"a".repeat(13 - nonAsciiIndex)}`;
      assertEqual(encodeJson(value)[0], 0xaf);
      assertSame(decodeJson(encodeJson(value)), value);
    }

    const error = assertThrowsInstanceOf(
      () => decodeJson([0xaf, ...Array.from({ length: 14 }, () => 0x61), 0xc2]),
      Error,
    );
    assertTrue(error.message.includes("Invalid UTF-8 string encoding."));
  });

  // Evolu's MessagePack profile uses WTF-8 for lone surrogates so every
  // JsonValue string round-trips without loss. Other malformed UTF-8 is rejected.
  it("round-trips surrogate pairs and lone surrogates", () => {
    const fixtures: ReadonlyArray<readonly [string, ReadonlyArray<number>]> = [
      ["\uD83C\uDF0D", [0xa4, 0xf0, 0x9f, 0x8c, 0x8d]],
      ["\uD800", [0xa3, 0xed, 0xa0, 0x80]],
      ["\uDFFF", [0xa3, 0xed, 0xbf, 0xbf]],
    ];

    for (const [value, bytes] of fixtures) {
      assertEqualBytes(encodeJson(value), bytes);
      assertSame(decodeJson(bytes), value);
    }

    const longValue = `${"a".repeat(64)}\uD800`;
    assertSame(decodeJson(encodeJson(longValue)), longValue);
  });

  for (const { name, bytes } of [
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
  ]) {
    it(`rejects ${name}`, () => {
      {
        const thrown = assertThrowsInstanceOf(
          () => decodeJson(bytes),
          BufferError,
        );

        assertTrue(thrown.message.includes("Invalid UTF-8 string encoding."));
      }
    });
  }

  it("rejects UTF-8 truncated within string data", () => {
    const twoByteError = assertThrowsInstanceOf(
      () => decodeJson([0xa1, 0xc2]),
      Error,
    );
    assertTrue(twoByteError.message.includes("Invalid UTF-8 string encoding."));
    const threeByteError = assertThrowsInstanceOf(
      () => decodeJson([0xa2, 0xe1, 0x80]),
      Error,
    );
    assertTrue(
      threeByteError.message.includes("Invalid UTF-8 string encoding."),
    );
    const fourByteError = assertThrowsInstanceOf(
      () => decodeJson([0xa3, 0xf1, 0x80, 0x80]),
      Error,
    );
    assertTrue(
      fourByteError.message.includes("Invalid UTF-8 string encoding."),
    );
  });

  it("accepts scalar and canonical WTF-8 boundaries", () => {
    assertEqual(decodeJson([0xa3, 0xed, 0x9f, 0xbf]), "\uD7FF");
    assertEqual(decodeJson([0xa3, 0xed, 0xa0, 0x80]), "\uD800");
    assertEqual(decodeJson([0xa4, 0xf4, 0x8f, 0xbf, 0xbf]), "\u{10FFFF}");
  });

  it("supports every array header boundary", () => {
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
      assertEqualBytes(bytes.subarray(0, header.length), header);
      assertEqual(decodeJson(bytes), value);
    }

    assertEqual(decodeJson(encodeJson([[], [null, [true]]])), [
      [],
      [null, [true]],
    ]);
    assertEqual(decodeJson([0xdc, 0, 0]), []);
    assertEqual(decodeJson([0xdd, 0, 0, 0, 0]), []);
  });

  it("supports every map header boundary", () => {
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
      assertEqualBytes(bytes.subarray(0, header.length), header);
      assertEqual(decodeJson(bytes), value);
    }

    assertEqual(decodeJson(encodeJson({ nested: { empty: {} } })), {
      nested: { empty: {} },
    });
    assertEqual(decodeJson([0xde, 0, 0]), {});
    assertEqual(decodeJson([0xdf, 0, 0, 0, 0]), {});
  });

  it("limits JSON nesting consistently", () => {
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
    assertSame(decoded, null);

    value = [value];
    const encodingError = assertThrowsInstanceOf(
      () => encodeJson(value),
      Error,
    );
    assertTrue(
      encodingError.message.includes(
        "JSON nesting exceeds the maximum depth of 1000.",
      ),
    );

    const tooDeepArrayBytes = new Uint8Array(maxDepth + 2);
    tooDeepArrayBytes.fill(0x91, 0, maxDepth + 1);
    tooDeepArrayBytes[maxDepth + 1] = 0xc0;
    const tooDeepArrayBuffer = createBuffer(tooDeepArrayBytes);
    const arrayDecodingError = assertThrowsInstanceOf(
      () => decodeJsonValue(tooDeepArrayBuffer),
      Error,
    );
    assertTrue(
      arrayDecodingError.message.includes(
        "JSON nesting exceeds the maximum depth of 1000.",
      ),
    );
    assertEqual(tooDeepArrayBuffer.unwrap(), tooDeepArrayBytes);

    const tooDeepMapBytes = new Uint8Array((maxDepth + 1) * 3 + 1);
    let position = 0;
    for (let index = 0; index <= maxDepth; index++) {
      tooDeepMapBytes[position++] = 0x81;
      tooDeepMapBytes[position++] = 0xa1;
      tooDeepMapBytes[position++] = 0x76;
    }
    tooDeepMapBytes[position] = 0xc0;
    const tooDeepMapBuffer = createBuffer(tooDeepMapBytes);
    const mapDecodingError = assertThrowsInstanceOf(
      () => decodeJsonValue(tooDeepMapBuffer),
      Error,
    );
    assertTrue(
      mapDecodingError.message.includes(
        "JSON nesting exceeds the maximum depth of 1000.",
      ),
    );
    assertEqual(tooDeepMapBuffer.unwrap(), tooDeepMapBytes);
  });

  it("encodes null-prototype objects", () => {
    const value = globalThis.Object.assign(
      globalThis.Object.create(null) as Record<string, unknown>,
      {
        key: "value",
      },
    );
    const decoded = decodeJson(encodeJson(value));

    assertEqual(decoded, { key: "value" });
    assertSame(
      globalThis.Object.getPrototypeOf(decoded),
      globalThis.Object.prototype,
    );
  });

  it("creates an own __proto__ data property", () => {
    const value = globalThis.Object.create(null) as Record<string, unknown>;
    value.__proto__ = { safe: true };

    const decoded = decodeJson(encodeJson(value));

    assertSame(
      globalThis.Object.getPrototypeOf(decoded),
      globalThis.Object.prototype,
    );
    assertTrue(globalThis.Object.hasOwn(decoded as object, "__proto__"));
    assertEqual(
      globalThis.Object.getOwnPropertyDescriptor(decoded, "__proto__"),
      {
        value: { safe: true },
        configurable: true,
        enumerable: true,
        writable: true,
      },
    );
  });

  it("uses the last value for duplicate map keys", () => {
    assertEqual(decodeJson([0x82, 0xa1, 0x61, 1, 0xa1, 0x61, 2]), {
      a: 2,
    });
    const decoded = decodeJson([
      0x82, 0xa9, 0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f, 1, 0xa9,
      0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f, 2,
    ]);
    assertType(Object, decoded);
    assertTrue("__proto__" in decoded);
  });

  it("decodes every string header for object keys", () => {
    assertEqual(decodeJson([0x81, 0xd9, 1, 0x61, 1]), { a: 1 });
    assertEqual(decodeJson([0x81, 0xda, 0, 1, 0x61, 1]), { a: 1 });
    assertEqual(decodeJson([0x81, 0xdb, 0, 0, 0, 1, 0x61, 1]), { a: 1 });

    const longKey = "a".repeat(33);
    assertEqual(decodeJson(encodeJson({ [longKey]: 1 })), {
      [longKey]: 1,
    });
  });

  it("handles object key cache collisions", () => {
    assertEqual(decodeJson(encodeJson({ "": 0 })), { "": 0 });
    assertEqual(decodeJson(encodeJson({ " ": 1 })), { " ": 1 });
    assertEqual(decodeJson(encodeJson({ abc: 2 })), { abc: 2 });
    assertEqual(decodeJson(encodeJson({ abd: 3 })), { abd: 3 });
    assertEqual(decodeJson(encodeJson({ abc: 4 })), { abc: 4 });
  });

  it("rejects maps with non-string keys", () => {
    {
      const thrown = assertThrowsInstanceOf(
        () => decodeJson([0x81, 1, 2]),
        BufferError,
      );

      assertTrue(
        thrown.message.includes("A decoded JSON object key must be a string."),
      );
    }
  });

  for (const marker of [
    0xc1, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xcf, 0xd3, 0xd4, 0xd5, 0xd6,
    0xd7, 0xd8,
  ]) {
    it(`rejects unsupported marker 0x${marker.toString(16)}`, () => {
      {
        const thrown = assertThrowsInstanceOf(
          () => decodeJson([marker]),
          BufferError,
        );

        assertTrue(thrown.message.includes("Unsupported MessagePack marker"));
      }
    });
  }

  for (const { name, bytes } of [
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
  ]) {
    it(`rejects ${name}`, () => {
      {
        const thrown = assertThrowsInstanceOf(
          () => decodeJson(bytes),
          BufferError,
        );

        assertTrue(thrown.message.includes("Buffer parse ended prematurely"));
      }
    });
  }

  it("rejects impossible declared lengths", () => {
    const array32Error = assertThrowsInstanceOf(
      () => decodeJson([0xdd, 0xff, 0xff, 0xff, 0xff]),
      Error,
    );
    assertTrue(array32Error.message.includes("Buffer parse ended prematurely"));
    const map32Error = assertThrowsInstanceOf(
      () => decodeJson([0xdf, 0xff, 0xff, 0xff, 0xff]),
      Error,
    );
    assertTrue(map32Error.message.includes("Buffer parse ended prematurely"));
    const string32Error = assertThrowsInstanceOf(
      () => decodeJson([0xdb, 0xff, 0xff, 0xff, 0xff]),
      Error,
    );
    assertTrue(
      string32Error.message.includes("Buffer parse ended prematurely"),
    );
    const array16Error = assertThrowsInstanceOf(
      () => decodeJson([0xdc, 0, 2, 0xc0]),
      Error,
    );
    assertTrue(array16Error.message.includes("Buffer parse ended prematurely"));
    const map16Error = assertThrowsInstanceOf(
      () => decodeJson([0xde, 0, 1, 0xa0]),
      Error,
    );
    assertTrue(map16Error.message.includes("Buffer parse ended prematurely"));
  });

  it("decodes exactly one value at a time", () => {
    const buffer = createBuffer();
    encodeJsonValue(buffer, JsonValue.orThrow({ first: true }));
    encodeJsonValue(buffer, JsonValue.orThrow(["second"]));

    assertEqual(decodeJsonValue(buffer), { first: true });
    assertEqual(decodeJsonValue(buffer), ["second"]);
    assertEqual(buffer.getLength(), 0);
  });

  it("leaves the Buffer unchanged after decoding fails", () => {
    const bytes = new Uint8Array([0x92, 1]);
    const buffer = createBuffer(bytes);

    assertThrowsInstanceOf(() => decodeJsonValue(buffer), BufferError);
    assertEqual(buffer.unwrap(), bytes);
  });

  it("resets reusable encoder state after appending fails", () => {
    const failedBuffer = {
      ...createBuffer(),
      extend: () => {
        throw new BufferError("append failed");
      },
    };

    const error = assertThrowsInstanceOf(
      () => encodeJsonValue(failedBuffer, JsonValue.orThrow("first")),
      Error,
    );
    assertTrue(error.message.includes("append failed"));
    assertEqualBytes(
      encodeJson("second"),
      [0xa6, 0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64],
    );
  });

  it("rejects reentrant encoding without corrupting encoder state", () => {
    const reentrantBuffer = {
      ...createBuffer(),
      extend: () => {
        encodeJsonValue(createBuffer(), JsonValue.orThrow("nested"));
      },
    };

    const error = assertThrowsInstanceOf(
      () => encodeJsonValue(reentrantBuffer, JsonValue.orThrow({ a: true })),
      Error,
    );
    assertTrue(
      error.message.includes("Reentrant JSON encoding is not supported."),
    );
    assertEqualBytes(encodeJson({ a: true }), [0x81, 0xa1, 0x61, 0xc3]);
  });

  it("rejects collection lengths beyond MessagePack uint32", () => {
    const value = {};
    const objectKeys = globalThis.Object.keys;
    const keysSpy = mock.method(
      globalThis.Object,
      "keys",
      (object: object): Array<string> =>
        object === value
          ? ({ length: 0x100000000 } as unknown as Array<string>)
          : objectKeys(object),
    );

    try {
      const error = assertThrowsInstanceOf(() => encodeJson(value), Error);
      assertTrue(
        error.message.includes(
          "Collection length exceeds the MessagePack uint32 limit.",
        ),
      );
    } finally {
      keysSpy.mock.restore();
    }
  });

  it("converts unexpected decoder errors to BufferError", () => {
    const errorBuffer = {
      ...createBuffer([0xc0]),
      shiftN: () => {
        throw new Error("unexpected");
      },
    };
    const error = assertThrowsInstanceOf(
      () => decodeJsonValue(errorBuffer),
      Error,
    );
    assertTrue(error.message.includes("Invalid MessagePack data"));
  });
});
