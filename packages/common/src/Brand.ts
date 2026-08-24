/**
 * A utility interface for creating branded types.
 *
 * @module
 */

/**
 * An interface for creating branded types.
 *
 * Branded types enhance type safety by distinguishing otherwise identical
 * types, such as `number` or `string`, to enforce stricter type checks. For
 * example, instead of a plain `number`, use `PositiveInt`. Instead of a plain
 * `string`, use `TrimmedString`.
 *
 * Avoid primitive types in domain code—brand everything. Evolu Type provides
 * many brand helpers.
 *
 * ### Single brand
 *
 * ```ts
 * import { assertEqual, type Brand } from "@evolu/common";
 *
 * type UserId = number & Brand<"UserId">;
 *
 * // Branding does not validate at runtime, so isolate the cast in a trusted
 * // factory.
 * const createUserId = (value: number): UserId => value as UserId;
 * const getUser = (id: UserId): number => id;
 * const userId = createUserId(123);
 * assertEqual(getUser(userId), 123);
 * // @ts-expect-error A plain number is not a UserId.
 * getUser(123);
 * ```
 *
 * ### Multiple brands
 *
 * ```ts
 * import { assertEqual, type Brand } from "@evolu/common";
 *
 * type Min1 = string & Brand<"Min1">;
 * type Max100 = string & Brand<"Max100">;
 * type Min1Max100 = string & Brand<"Min1" | "Max100">;
 *
 * const requiresMin1 = (value: Min1): string => value;
 * const requiresMax100 = (value: Max100): string => value;
 *
 * const min1Max100Value: Min1Max100 = "typescript" as Min1Max100;
 *
 * assertEqual(requiresMin1(min1Max100Value), "typescript");
 * assertEqual(requiresMax100(min1Max100Value), "typescript");
 * ```
 *
 * ### Standalone brand
 *
 * Brand can be used alone without a base type for purely nominal typing. This
 * is useful for opaque values where the internal structure is hidden and type
 * identity is based on name only. For example, platform-specific handles can be
 * branded to prevent accidental mixing of implementations while keeping common
 * code platform-agnostic.
 *
 * ```ts
 * import { assertSame, type Brand } from "@evolu/common";
 *
 * type NativePort = Brand<"NativePort">;
 *
 * const requiresNativePort = (port: NativePort): NativePort => port;
 *
 * const nativeValue: unknown = { id: 1 };
 * const port = nativeValue as NativePort;
 * assertSame(requiresNativePort(port), nativeValue);
 * // @ts-expect-error An unknown value is not a NativePort.
 * requiresNativePort(nativeValue);
 * ```
 */
export interface Brand<B extends string> {
  readonly [__brand]: Readonly<Record<B, true>>;
}

declare const __brand: unique symbol;

/**
 * Determines whether a type `T` is a branded type.
 *
 * Works with any base type intersected with a `Brand`.
 *
 * ### Example
 *
 * - `IsBranded<string>` -> false
 * - `IsBranded<string & Brand<"X">>` -> true
 */
export type IsBranded<T> = T extends Brand<string> ? true : false;
