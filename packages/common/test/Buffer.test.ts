import { expect, test } from "vitest";
import { BufferError, createBuffer } from "../src/Buffer.js";
import { NonNegativeInt } from "../src/Type.js";

test("BufferError should be instanceof Error", () => {
  const error = new BufferError("test error");
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(BufferError);
  expect(error.name).toBe("BufferError");
  expect(error.message).toBe("test error");
});

test("Buffer", () => {
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
  expect(buffer2.unwrap()).toMatchInlineSnapshot(`
    Uint8Array [
      1,
    ]
  `);

  expect(buffer2.shift()).toBe(1);
  expect(buffer2.unwrap()).toMatchInlineSnapshot(`Uint8Array []`);

  buffer2.extend([1, 2, 3]);
  expect(buffer2.shiftN(2 as NonNegativeInt)).toMatchInlineSnapshot(`
    Uint8Array [
      1,
      2,
    ]
  `);

  expect(buffer2.unwrap()).toMatchInlineSnapshot(`
    Uint8Array [
      3,
    ]
  `);

  expect(() => buffer2.shiftN(2 as NonNegativeInt)).toThrow(BufferError);
  expect(() => buffer2.shiftN(2 as NonNegativeInt)).toThrowError(
    "Buffer parse ended prematurely",
  );

  buffer2.shift();

  expect(() => buffer2.shift()).toThrow(BufferError);
  expect(() => buffer2.shift()).toThrowError("Buffer parse ended prematurely");

  expect(buffer2.shiftN(0 as NonNegativeInt)).toStrictEqual(new Uint8Array(0));
});

test("Buffer initial capacity with data", () => {
  const buffer = createBuffer(new Uint8Array(300));
  expect(buffer.getLength()).toBe(300);
  expect(buffer.getCapacity()).toBe(300); // Should match input, not 512
});

test("Buffer unwrap modification affects internal state", () => {
  const buffer = createBuffer([1, 2, 3]);
  const view = buffer.unwrap();
  view[0] = 99;
  expect(buffer.unwrap()).toStrictEqual(new Uint8Array([99, 2, 3]));
});

test("Buffer truncate", () => {
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
  }).toThrowError("Cannot truncate to a length greater than current");

  buffer.extend([6, 7, 8]);
  expect(buffer.getLength()).toBe(3);
  expect(buffer.unwrap()).toStrictEqual(new Uint8Array([6, 7, 8]));

  buffer.truncate(2 as NonNegativeInt);
  expect(buffer.getLength()).toBe(2);
  expect(buffer.unwrap()).toStrictEqual(new Uint8Array([6, 7]));
});
