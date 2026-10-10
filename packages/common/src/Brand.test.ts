import { test } from "node:test";

import type { Brand, IsBranded } from "./Brand.ts";
import { constVoid } from "./Function.ts";
import { assertType } from "./Type.ts";

test("Brand", () => {
  type UserId = string & Brand<"UserId">;
  type ProductId = number & Brand<"ProductId">;

  const validUserId: UserId = "user123" as UserId;
  assertType<typeof validUserId, string & Brand<"UserId">>();

  const validProductId: ProductId = 42 as ProductId;
  assertType<typeof validProductId, number & Brand<"ProductId">>();

  // Invalid assignment (string to ProductId)
  // @ts-expect-error A string is not assignable to ProductId.
  void ("not-a-number" satisfies ProductId);

  // Invalid assignment (unbranded string to UserId)
  // @ts-expect-error An unbranded string is not assignable to UserId.
  void ("user123" satisfies UserId);

  // Invalid assignment (mixing different brands)
  // @ts-expect-error A ProductId is not assignable to UserId.
  void (validProductId satisfies UserId);
});

test("Brand - multiple brands", () => {
  type Min1 = string & Brand<"Min1">;
  type Max100 = string & Brand<"Max100">;
  type Min1Max100 = string & Brand<"Min1" | "Max100">;

  const requiresMin1 = (_value: Min1) => constVoid;
  const requiresMax100 = (_value: Max100) => constVoid;

  const min1Value: Min1 = "hello" as Min1;
  const max100Value: Max100 = "world" as Max100;
  const min1Max100Value: Min1Max100 = "typescript" as Min1Max100;

  requiresMin1(min1Value);
  requiresMax100(max100Value);
  requiresMin1(min1Max100Value);
  requiresMax100(min1Max100Value);

  // @ts-expect-error: brands works
  requiresMin1("hello");
  // @ts-expect-error: brands works
  requiresMin1(max100Value);
  // @ts-expect-error: brands works
  requiresMax100("world");
  // @ts-expect-error: brands works
  requiresMax100(min1Value);
});

test("IsBranded", () => {
  type UnbrandedString = string;
  type BrandedString = string & Brand<"UserId">;
  type BrandedNumber = number & Brand<"ProductId">;
  type DoubleBranded = string & Brand<"Min"> & Brand<"Max">;

  assertType<IsBranded<UnbrandedString>, false>();
  assertType<IsBranded<BrandedString>, true>();
  assertType<IsBranded<BrandedNumber>, true>();
  assertType<IsBranded<DoubleBranded>, true>();
});

test("Brand - standalone (nominal type)", () => {
  // Brand can be used alone without a base type for purely nominal typing.
  // Useful for platform-specific values where type identity is based on name only.
  type NativePort = Brand<"NativePort">;

  const requiresNativePort = (_port: NativePort) => constVoid;

  // Only branded values can be passed
  const nativePort: NativePort = {} as NativePort;
  requiresNativePort(nativePort);

  // @ts-expect-error: plain unknown cannot be passed
  requiresNativePort({} as unknown);

  // @ts-expect-error: other types cannot be passed
  requiresNativePort({});

  // @ts-expect-error: null cannot be passed
  requiresNativePort(null);

  assertType<IsBranded<NativePort>, true>();
});
