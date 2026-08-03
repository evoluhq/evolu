/**
 * Runtime types.
 *
 * @module
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  AtLeastTwoReadonlyArray,
  NonEmptyReadonlyArray,
} from "./Array.ts";
import { assert, assertNonNullable } from "./Assert.ts";
import type { Brand } from "./Brand.ts";
import { identity, type Thunk } from "./Function.ts";
import { createMutableRecord } from "./Object.ts";
import {
  err,
  flatMapResult,
  getOrNull,
  getOrThrow,
  ok,
  trySync,
  type Result,
} from "./Result.ts";
import { safelyStringifyUnknownValue } from "./String.ts";
import type { Task } from "./Task.ts";
import type {
  CompileTimeError,
  Digit,
  Digit1To9,
  Int1To100,
  IsUnion,
  Literal,
  Simplify,
  ValueWithLength,
  WidenLiteral,
} from "./Types.ts";

/**
 * A runtime representation of a TypeScript type with typed structured errors.
 *
 * Evolu Type reports expected decoding failures through {@link Result} rather
 * than exceptions. It represents both an encoded `Input` and its semantic
 * `Output`, supporting validation, transformation, and canonical encoding.
 *
 * Existing TypeScript validation libraries make different, reasonable
 * tradeoffs. Runtime types are foundational to Evolu, so Evolu Type is designed
 * around the same abstractions and conventions as the rest of the library:
 *
 * - **Result-based error handling** – expected failures are explicit values.
 * - **Standard Schema interoperability** – every Type can be passed directly to
 *   compatible tools while preserving its exact Input and Output.
 * - **Typed errors with decoupled formatters** – validation logic stays
 *   independent of user-facing messages, and errors can be handled
 *   exhaustively.
 * - **Type-safe, tree-shakeable localization** – formatter requirements are
 *   inferred from selected Types, while apps bundle exactly the locales they
 *   support so users can change language offline.
 * - **Consistent constraints through {@link Brand}** – every constraint is
 *   represented in the TypeScript type.
 * - **Typed inputs** – `from` and its `.parent` entry points connect precise
 *   producer and consumer contracts while preserving typed remaining errors.
 * - **Lawful codecs** – Types partially decode `Input` to `Output` and totally
 *   encode every legitimate `Output` back to canonical `Input`.
 * - **A top-down implementation** – the source is intended to be read from
 *   beginning to end.
 *
 * Evolu Type assumes that all executing code, including third-party
 * dependencies, has been audited and is trusted. It validates data contracts
 * under that assumption. Trusting code does not require trusting every value it
 * returns, so uncertain data can still be decoded at an explicit boundary.
 *
 * Type declarations and their callbacks are trusted TypeScript construction
 * code. Runtime assertions enforce contracts TypeScript cannot express, such as
 * refinement identity and exact Output representation. Evolu Type does not try
 * to recover from construction code that defeats the type system with `any` or
 * casts, including fabricating an `Err` for `Result<_, never>`. Every Type
 * declaration must be exercised by tests, including its expected successes and
 * failures.
 *
 * `fromUnknown` validates untyped input through the complete pipeline. Typed
 * operations use their declared boundary to determine which remaining stages
 * can return validation errors, but assert that boundary at runtime. A failed
 * assertion means application code violated its static contract; it is a
 * developer error, not an expected validation failure. The thrown Error formats
 * the exact Output validation error and preserves its structured value as the
 * cause. Use `fromUnknown` for values entering the typed program from an
 * external source. `is` means exact membership in the output domain, not merely
 * that output-side parsing could succeed. A successful `fromUnknown` result
 * always satisfies `is`.
 *
 * Decoding accepts a representation outside the Output domain only when the
 * Type explicitly declares that representation, such as a transformation Input.
 * Structural Types do not implicitly repair exotic or foreign-realm JavaScript
 * representations. In particular, {@link array} and {@link tuple} require dense
 * own data elements, while the predefined {@link Object}, {@link object}, and
 * {@link record} require own enumerable data properties. They do not invoke
 * accessors or materialize inherited and non-enumerable properties.
 *
 * TypeScript object types are structural and do not encode JavaScript realm
 * identity. {@link array} accepts this realm's `Array.prototype`. The predefined
 * {@link Object} and plain-object Types created by {@link object} and
 * {@link record} accept this realm's `Object.prototype` or a `null` prototype.
 * When Record decoding must construct a normalized value, it uses a `null`
 * prototype so every string key remains ordinary data.
 *
 * Evolu Type expects TypeScript's `exactOptionalPropertyTypes` compiler option
 * to be enabled.
 *
 * Predefined Types intentionally use the names of corresponding JavaScript
 * built-ins because they represent those familiar value categories. If an
 * imported Type shadows a built-in in the same scope, access the built-in
 * through `globalThis`, JavaScript's standard cross-environment global object,
 * such as `globalThis.String` or `globalThis.Date`.
 *
 * ### Example
 *
 * ```ts
 * import { String, type Result } from "@evolu/common";
 *
 * const value: unknown = "hello";
 * const result = String.fromUnknown(value);
 *
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<
 *     string,
 *     {
 *       readonly type: "TypeOf";
 *       readonly expected: "String";
 *       readonly value: unknown;
 *     }
 *   >
 * >();
 * expectOk(result, "hello");
 * ```
 *
 * ## FAQ
 *
 * ### What does a Type represent?
 *
 * A Type is a lawful, pure codec for an exact semantic domain:
 *
 * ```text
 * Input  ──partial decode──▶ Output
 * Input  ◀─── total encode ── Output
 * ```
 *
 * Read each line in the direction of its arrowhead: an Input might decode into
 * an Output because not every Input is valid, while every valid Output can be
 * encoded back to an Input. `fromUnknown` and the `from` operations decode;
 * `to` encodes. `Input` is the encoded representation; `Output` is the semantic
 * value that representation denotes.
 *
 * A lawful Type round-trips every Output:
 *
 * ```text
 * fromUnknown(to(output)) ≈ ok(output)
 * ```
 *
 * Encoding can canonicalize a valid Input:
 *
 * ```text
 * "0042" ──decode──▶ 42 ──encode──▶ "42"
 * ```
 *
 * Once canonicalized, repeating the decode-encode cycle must preserve that
 * representation:
 *
 * ```text
 * "42" ──decode──▶ 42 ──encode──▶ "42"
 * ```
 *
 * Here `decode` means running the complete decoding pipeline, as `fromUnknown`
 * does, and `≈` means equality appropriate for the semantic domain. Validation
 * refinements, {@link ArrayType | Array Types}, and
 * {@link ObjectType | Object Types} preserve these laws when their contained
 * Types do. A {@link union} additionally requires compatible dispatch: it
 * encodes through the first member matching the Output and decodes through the
 * first member accepting the Input. Member ordering is lawful only when those
 * choices agree semantically. Encoded representations can overlap even when
 * member Output types are disjoint.
 *
 * ### Why is to total?
 *
 * Suppose a Type accepts only strings containing decimal digits and decodes
 * them to JavaScript numbers. Parsing `"42"` is possible, but the Type cannot
 * lawfully declare its Output as `number`:
 *
 * ```text
 * digits-only string ──partial decode──▶ number
 * digits-only string ◀─── total encode ── number  // impossible
 * ```
 *
 * `number` also contains negative and fractional numbers, `NaN`, positive and
 * negative infinity, and `-0`. None of those values has a digits-only
 * representation, so `to` could not encode every valid Output.
 *
 * One lawful design narrows the Output to the exact representable domain:
 *
 * ```text
 * digits-only string ──partial decode──▶ NonNegativeSafeInteger
 * digits-only string ◀─── total encode ── NonNegativeSafeInteger
 *
 * "0042" ──decode──▶ 42 ──encode──▶ "42"
 * ```
 *
 * Another lawful design keeps `number` as the Output but expands the Input
 * representation to include a canonical string for every number, including
 * `"NaN"`, `"Infinity"`, `"-Infinity"`, and `"-0"`, as well as negative and
 * fractional numbers.
 *
 * The same principle applies when converting between two representations. Give
 * each representation its own Type with the same exact Output. For example, a
 * string representation and a number representation can both decode to the
 * shared `SafeInteger` domain:
 *
 * ```text
 * string ──partial decode──▶ SafeInteger
 * string ◀─── total encode ── SafeInteger
 *
 * number ──partial decode──▶ SafeInteger
 * number ◀─── total encode ── SafeInteger
 * ```
 *
 * Conversion decodes the source representation, then total-encodes the shared
 * Output into the target representation. If no lossless shared domain exists,
 * the operation is a partial conversion, migration, or policy decision and
 * should be an explicit function returning Result, not a Type transformation.
 *
 * ### Why can a typed operation throw?
 *
 * TypeScript proves structural assignability, but it cannot describe every
 * runtime invariant. For example, it cannot express whether an object property
 * is own, enumerable, or a data property. It also permits a wider object with
 * excess properties where a narrower object type is expected.
 *
 * `fromUnknown` treats such invalid external values as expected data and
 * returns a typed error. Typed operations instead assert the boundary promised
 * by their parameter type. If application code claims an accessor-backed object
 * or an object with excess properties is an Object Output, the assertion throws
 * because the application contract is broken.
 *
 * Materialize accessor values into plain data, remove properties the Type does
 * not represent, or use a different Type. Silently discarding excess data would
 * make the code constructing it dead while appearing to encode it successfully.
 * One exact Object policy also keeps Output membership independent of parsing
 * configuration. Exact structural policies also keep Output membership
 * independent of whether a transformation happens to allocate a new value.
 * Evolu Type therefore does not invoke accessors, discard excess properties, or
 * make `to` fallible. This keeps `to` total for every legitimate Output and
 * lets transformations compose without an encoding-error channel.
 *
 * ### How should values from another realm be handled?
 *
 * Code trust and data validation are separate decisions. When an application or
 * library trusts both the producer and its return contract, it should cast the
 * boundary API's `unknown` instead of decoding the same internal value again.
 * Some transports, including worker messaging, already recreate structured
 * values in the receiving realm.
 *
 * When returned data still needs runtime checking, its validator or
 * transformation should be tailored to that API's documented representation.
 * Evolu Type deliberately does not guess how a foreign representation should be
 * projected into local data. {@link array} and {@link tuple} accept only this
 * realm's `Array.prototype`; the predefined {@link Object}, {@link object}, and
 * {@link record} accept only this realm's `Object.prototype` or `null`.
 *
 * A cast does not convert a direct foreign object into an Evolu Type Output. If
 * such a value must pass through Type operations, explicitly convert it to the
 * local representation and validate it with a boundary-specific Type. The
 * decision to trust, validate, or adapt a value therefore remains visible in
 * application code.
 *
 * ### Why doesn't Evolu Type extract data from rich objects?
 *
 * Some validation libraries parse an object's data projection. An imaginary
 * validation library can enumerate own enumerable string properties and decode
 * them into a fresh plain object. That lets a class instance decode as plain
 * data while its prototype and methods are ignored. The same general policy can
 * treat a `Date` or `Map` as an empty Record and can invoke enumerable getters.
 * This is a coherent but intentionally forgiving normalization model.
 *
 * Evolu Type validates exactly the runtime representation defined by each Type;
 * it does not implicitly project one representation into another. The
 * predefined {@link Object} defines an open plain-object representation with
 * unknown values, {@link object} defines a closed plain-object representation,
 * and {@link record} defines a plain-dictionary representation whose complete
 * set of own properties are its entries. They accept only this realm's
 * `Object.prototype` or `null`. Every property must be an enumerable data
 * property; inherited members are not entries, while accessors and hidden
 * properties are invalid instead of being invoked or ignored. {@link array}
 * similarly defines a dense sequence whose only own properties are `length` and
 * its indexed data properties; {@link tuple} applies the same representation
 * rules with a fixed length and a distinct Type for each position. Only an
 * explicit {@link transform} changes the representation. Consequently, `is`
 * tests exact Output membership and `to` stays total for valid Outputs.
 *
 * ### Why is JsonValue stricter than JSON.stringify?
 *
 * `JSON.stringify` is a forgiving data projection. It can invoke `toJSON` and
 * accessors, discard object properties, replace unsupported array elements and
 * non-finite numbers with `null`, and normalize `-0` to `0`. Those rules are
 * useful for ordinary serialization, but they do not preserve an exact value.
 *
 * {@link JsonValue} instead defines data that is already represented as data.
 * Invalid runtime behavior and values are rejected rather than interpreted or
 * silently discarded. Its encoder is total and stack-safe for every valid
 * Output, and {@link JsonValueFromJson} preserves the semantic value when it is
 * encoded and decoded, including JavaScript's distinction between `-0` and `0`.
 * Use an explicit transformation before this boundary when a projection or
 * other normalization is desired.
 *
 * ### Why are Types pure and synchronous?
 *
 * A Type describes data meaning, not work. Time, I/O, dependencies, external
 * state, authorization, and other contextual decisions belong in a {@link Task}.
 * Use a Type to decode the data required by that work, then pass the decoded
 * value to a Task. A pure synchronous conversion that can fail can be an
 * ordinary function returning Result.
 *
 * Keeping those responsibilities separate prevents an Evolu Type from becoming
 * a hidden application workflow. It also keeps validation deterministic,
 * dependency-free, immediately composable, and straightforward to test.
 *
 * ### What if only decoding is needed?
 *
 * Use `fromUnknown` for unknown data. For typed application data, call `from`
 * at the boundary its input type proves, or use `orThrow` or `orNull` for a
 * flat conversion from `Input`. The canonical `to` encoder still keeps the Type
 * lawful and composable with transformations and structural Types. A genuinely
 * irreversible operation is a separate function or Task, not a Type
 * transformation.
 */
export interface Type<
  Name extends TypeName,
  in out Input,
  in out Output,
  Error extends TypeError,
  in out Parent extends TypeNode | null = null,
  in out Errors extends TypeError =
    | Error
    | ([Parent] extends [infer P extends TypeNode] ? InferErrors<P> : never),
  in out CustomFrom extends CustomFromOperation = never,
> extends TypeNode {
  // `Input`, `Output`, `Parent`, `Errors`, and `CustomFrom` are explicitly
  // invariant to reduce compiler work in recursive Type comparisons. Changes
  // are measured by `pnpm bench:type`.
  /** The name identifying this Type node. */
  readonly name: Name;

  /**
   * Standard Schema V1 interoperability.
   *
   * Validation runs the complete `fromUnknown` pipeline synchronously and
   * reports every structured failure as a localized message with a separate
   * property path.
   */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;

  /**
   * The encoded representation accepted by `orThrow`, `orNull`, and the deepest
   * available `from` boundary, and produced by `to`.
   *
   * This is a type-only phantom property. Use it through `typeof Type.Input`;
   * it does not exist at runtime.
   */
  readonly Input: Input;

  /**
   * The semantic value produced by decoding and accepted by bare `from` and
   * `to`.
   *
   * This is a type-only phantom property. Use it through `typeof Type.Output`;
   * it does not exist at runtime.
   */
  readonly Output: Output;

  /**
   * The error introduced at this Type node.
   *
   * This is a type-only phantom property. Use it through `typeof Type.Error`;
   * it does not exist at runtime.
   */
  readonly Error: Error;

  // Cached type-level union of every error returnable by `fromUnknown`.
  // Avoids recursive recomputation during Type composition. Changes are measured
  // by `pnpm bench:type`.
  readonly [errorsSymbol]: Errors;

  // Private type-level marker distinguishing a concrete Type from an erased
  // TypeNode. It does not exist at runtime.
  readonly [concreteTypeSymbol]: true;

  // Private type-level specialized `from` operation. It does not exist at
  // runtime.
  readonly [customFromSymbol]: CustomFrom;

  /** The one preceding Type node, or `null` for a root Type. */
  readonly parent: Parent;

  /** Decodes an unknown value through the complete Type pipeline. */
  readonly fromUnknown: (
    value: unknown,
    options?: ValidationOptions,
  ) => Result<Output, Errors>;

  /**
   * Formats an error returned by `fromUnknown` or `from` as one human-readable
   * message. Built-in Types use English; {@link localizeTypes} derives Types
   * with localized formatters.
   *
   * Structural errors retain nested errors and their locations in the typed
   * error value. This formatter does not encode paths or enumerate nested
   * errors in its message.
   */
  readonly formatError: TypeErrorFormatter<Errors>;

  /** Checks whether an unknown value is a valid semantic `Output`. */
  readonly is: (value: unknown) => value is Output;

  /**
   * Runs the remaining Type pipeline from a typed boundary.
   *
   * `from` accepts this Type's `Output`. Its first `.parent` accepts the
   * immediate parent Output, and each additional suffix moves the boundary one
   * Type toward the root. The deepest suffix accepts the root Output.
   *
   * Every entry point asserts its selected boundary before running the
   * remaining pipeline. Assertion failures throw because they indicate a
   * developer error. The Error message formats the exact boundary validation
   * error and its cause preserves the structured error value. Only failures
   * introduced after that boundary are returned through `Result`.
   */
  readonly from: [CustomFrom] extends [never]
    ? [Parent] extends [infer P extends TypeNode]
      ? FromOperation<Output, Error, P>
      : TypeOperationFn<"from", Output, Output, never>
    : CustomFrom;

  /** Asserts and encodes an `Output` as its canonical `Input` representation. */
  readonly to: (value: Output) => Input;

  /**
   * Runs the complete remaining pipeline from the typed `Input` boundary,
   * throwing if validation fails.
   *
   * This is a flat whole-conversion convenience. To throw from another typed
   * boundary, compose {@link getOrThrow} with the corresponding `from.parent`
   * suffix.
   */
  readonly orThrow: TypeOperationFn<"orThrow", Input, Output, never>;

  /**
   * Runs the complete remaining pipeline from the typed `Input` boundary,
   * returning `null` if validation fails.
   *
   * This is a flat whole-conversion convenience. To return `null` from another
   * typed boundary, compose {@link getOrNull} with the corresponding
   * `from.parent` suffix. Exceptions thrown by Type operations are not
   * converted to `null`.
   */
  readonly orNull: TypeOperationFn<"orNull", Input, Output, never>;
}

export type TypeName = Capitalize<string>;

/**
 * A plain structured error produced by a {@link Type} operation.
 *
 * It is a domain value discriminated by `type`, not an instance of JavaScript's
 * global `TypeError`.
 *
 * Each distinct error meaning and shape should use a unique `type`. Reuse a tag
 * only when it intentionally represents the same error contract. Accidental
 * reuse prevents reliable discriminated-union narrowing.
 */
export interface TypeError<Name extends TypeName = TypeName> {
  readonly type: Name;
}

/**
 * A structured error that directly describes a rejected value.
 *
 * Structural errors such as Array and Union errors extend {@link TypeError}
 * instead because they locate nested errors rather than own one value.
 */
// Built-in errors intentionally repeat narrower `value` properties. Making
// `value` generic here and sharing this base regresses `pnpm bench:type`.
export interface TypeValueError<
  Name extends TypeName = TypeName,
> extends TypeError<Name> {
  readonly value: unknown;
}

/** Formats a structured {@link TypeError} as a human-readable message. */
export type TypeErrorFormatter<Error extends TypeError> = (
  error: Error,
) => string;

export interface TypeNode {
  readonly name: TypeName;
  readonly "~standard": StandardSchemaV1.Props<unknown, unknown>;
  /** A type-only phantom property that does not exist at runtime. */
  readonly Input: unknown;
  /** A type-only phantom property that does not exist at runtime. */
  readonly Output: unknown;
  /** A type-only phantom property that does not exist at runtime. */
  readonly Error: TypeError;
  readonly [errorsSymbol]: TypeError;
  readonly [customFromSymbol]: unknown;
  readonly parent: TypeNode | null;
  readonly fromUnknown: (
    value: unknown,
    options?: ValidationOptions,
  ) => Result<unknown, TypeError>;
  readonly is: (value: unknown) => boolean;
}

declare const outputValidationSymbolType: unique symbol;
const outputValidationSymbol: typeof outputValidationSymbolType =
  /*#__PURE__*/ globalThis.Symbol() as typeof outputValidationSymbolType;

declare const getRuntimeTypeIssuesSymbolType: unique symbol;
const getRuntimeTypeIssuesSymbol: typeof getRuntimeTypeIssuesSymbolType =
  /*#__PURE__*/ globalThis.Symbol() as typeof getRuntimeTypeIssuesSymbolType;

type RuntimeOutputValidation = (
  value: unknown,
  options?: ValidationOptions,
) => Result<unknown, TypeError>;

type RuntimeFormatErrorByType = Readonly<
  Record<string, TypeErrorFormatter<TypeError>>
>;

interface RuntimeTypeIssue {
  readonly name: TypeName;
  readonly error: TypeError;
  readonly path: ReadonlyArray<PropertyKey>;
  readonly formatError: TypeErrorFormatter<TypeError>;
}

type RuntimeGetTypeIssues = (
  error: TypeError,
  mode: ValidationOptions["errors"],
) => NonEmptyReadonlyArray<RuntimeTypeIssue>;

type RuntimeFormatTypeIssue = (issue: RuntimeTypeIssue) => string;

const singleRuntimeTypeIssue = (
  formatterName: TypeName,
  error: TypeError,
  defaultFormatter: TypeErrorFormatter<TypeError>,
  path: ReadonlyArray<PropertyKey> = [],
): NonEmptyReadonlyArray<RuntimeTypeIssue> => [
  { name: formatterName, error, path, formatError: defaultFormatter },
];

const prependRuntimeTypeIssuePath = (
  key: PropertyKey,
  issues: NonEmptyReadonlyArray<RuntimeTypeIssue>,
): NonEmptyReadonlyArray<RuntimeTypeIssue> =>
  issues.map((issue) => ({
    ...issue,
    path: [key, ...issue.path],
  })) as unknown as NonEmptyReadonlyArray<RuntimeTypeIssue>;

type RuntimeCollectionIssue = {
  readonly kind: string;
  readonly error?: TypeError;
} & ({ readonly index: number } | { readonly key: string | symbol });

const createCollectionRuntimeTypeIssues =
  (
    name: "Array" | "Tuple" | "Record",
    issuesKind: "Items" | "Entries",
    defaultFormatter: TypeErrorFormatter<TypeError>,
    getNestedType: (issue: RuntimeCollectionIssue) => RuntimeTypeNode,
  ): RuntimeGetTypeIssues =>
  (error, mode) => {
    const reason = (
      error as TypeError & {
        readonly reason: {
          readonly kind: string;
          readonly issues?: NonEmptyReadonlyArray<RuntimeCollectionIssue>;
        };
      }
    ).reason;

    if (reason.kind !== issuesKind) {
      return singleRuntimeTypeIssue(name, error, defaultFormatter);
    }

    const allIssues = reason.issues!;
    const issues = mode === "first" ? ([allIssues[0]] as const) : allIssues;

    return issues.flatMap((issue): ReadonlyArray<RuntimeTypeIssue> => {
      const path = "key" in issue ? issue.key : issue.index;

      if (issue.error !== undefined) {
        return prependRuntimeTypeIssuePath(
          path,
          getNestedType(issue)[getRuntimeTypeIssuesSymbol](issue.error, mode),
        );
      }

      return singleRuntimeTypeIssue(
        name,
        mode === "first"
          ? error
          : ({
              type: name,
              reason: { kind: issuesKind, issues: [issue] },
            } as TypeError),
        defaultFormatter,
        [path],
      );
    }) as unknown as NonEmptyReadonlyArray<RuntimeTypeIssue>;
  };

const formatDefaultRuntimeTypeIssue: RuntimeFormatTypeIssue = (issue) =>
  issue.formatError(issue.error);

/**
 * Asserts that a value belongs to a {@link Type} Output domain.
 *
 * Use this for internal invariants, not external input. Validate external input
 * with `Type.fromUnknown` so expected failures remain typed values. A failed
 * assertion formats the exact Output validation error and preserves its
 * structured value as the thrown Error's cause.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   NonEmptyTrimmedString100,
 *   assertType,
 *   type Brand,
 * } from "@evolu/common";
 *
 * const value: unknown = "Evolu";
 * assertType(NonEmptyTrimmedString100, value);
 * expectTypeOf(value).toEqualTypeOf<
 *   string & Brand<"Trimmed"> & Brand<"MinLength1"> & Brand<"MaxLength100">
 * >();
 * ```
 */
type AssertTypeFn = <T extends TypeNode>(
  type: T,
  value: unknown,
) => asserts value is T["Output"];

export const assertType: AssertTypeFn = (type, value) => {
  const runtimeType = type as RuntimeTypeNode;
  assertTypeOutput(
    runtimeType.is,
    runtimeType[outputValidationSymbol],
    runtimeType.formatError,
    value,
  );
};

const assertTypeOutput = <Error extends TypeError>(
  is: (value: unknown) => boolean,
  validateOutput: (
    value: unknown,
    options?: ValidationOptions,
  ) => Result<unknown, Error>,
  formatError: TypeErrorFormatter<Error>,
  value: unknown,
  options: ValidationOptions = firstValidationOptions,
): void => {
  if (is(value)) return;

  const result = validateOutput(value, options);
  const error = (result as { readonly ok: false; readonly error: Error }).error;

  throw new Error(formatError(error), {
    cause: error,
  });
};

/**
 * Creates localized copies of selected {@link Type | Types} for every locale.
 *
 * Each locale supplies one formatter for every Type that can own a formatted
 * error. Structural Types use their own formatter for structural failures and
 * delegate contained failures to the Type that produced them. A Union owns its
 * complete failure because no member matched. Formatter requirements are
 * inferred recursively from structured errors, including mutually recursive
 * Lazy error interfaces.
 *
 * All localized Types for one locale share the same formatter set. The result
 * preserves the selected names and exact TypeScript types under every locale
 * key, making one localized set easy to provide through dependency injection or
 * application context. Canonical Types remain unchanged.
 *
 * Localization is scoped to the Types an app imports instead of a package-wide
 * translation registry. Ordinary static imports give bundlers an explicit
 * dependency graph from those Types to their formatters, so unrelated Type and
 * localization code can be removed. An app supplies all locales it supports in
 * the same self-contained bundle, allowing users to change language without a
 * network connection. Different localized Type sets can coexist on one page or
 * in separate dependency-injection scopes.
 *
 * ### Example
 *
 * ```ts
 * import { String, localizeTypes, minLength } from "@evolu/common";
 * import { cs } from "@evolu/common/intl";
 *
 * const Label = minLength(1)(String);
 *
 * const TypesByLocale = localizeTypes(
 *   { Label },
 *   {
 *     cs: {
 *       MinLength1: cs.formatMinLengthError,
 *       String: cs.formatStringError,
 *     },
 *   },
 * );
 *
 * expectTypeOf<typeof TypesByLocale.cs.Label>().toEqualTypeOf<
 *   typeof Label
 * >();
 * ```
 */
export const localizeTypes = ((
  typesByName: Readonly<Record<string, ConcreteTypeNode>>,
  formatErrorByTypeByLocale: Readonly<Record<string, unknown>>,
) => {
  const typesByNameByLocale = createMutableRecord<
    string,
    Readonly<Record<string, ConcreteTypeNode>>
  >();

  for (const locale of globalThis.Object.keys(formatErrorByTypeByLocale)) {
    const inputFormatErrorByType = formatErrorByTypeByLocale[
      locale
    ] as RuntimeFormatErrorByType;
    const formatErrorByType = createMutableRecord<
      string,
      TypeErrorFormatter<TypeError>
    >();

    for (const name of globalThis.Object.keys(inputFormatErrorByType)) {
      formatErrorByType[name] = inputFormatErrorByType[name];
    }

    const localizedTypesByName = createMutableRecord<
      string,
      ConcreteTypeNode
    >();
    const localizedTypeBySource = new WeakMap<
      RuntimeTypeNode,
      RuntimeTypeNode
    >();
    const formatIssue: RuntimeFormatTypeIssue = (issue) =>
      formatErrorByType[
        issue.error.type === "TypeOf"
          ? (issue.error as TypeOfError<keyof TypeOfOutputByName>).expected
          : issue.name
      ](issue.error);

    for (const name of globalThis.Object.keys(typesByName)) {
      const source = typesByName[name] as ConcreteTypeNode & RuntimeTypeNode;
      localizedTypesByName[name] = withFormatError(
        source,
        formatIssue,
        localizedTypeBySource,
      ) as unknown as ConcreteTypeNode;
    }

    typesByNameByLocale[locale] = localizedTypesByName;
  }

  return typesByNameByLocale;
}) as LocalizeTypes;

const withFormatError = (
  source: RuntimeTypeNode,
  formatIssue: RuntimeFormatTypeIssue,
  localizedTypeBySource: WeakMap<RuntimeTypeNode, RuntimeTypeNode>,
): RuntimeTypeNode => {
  const cached = localizedTypeBySource.get(source);
  if (cached) return cached;

  const parent = source.parent
    ? withFormatError(
        source.parent as RuntimeTypeNode,
        formatIssue,
        localizedTypeBySource,
      )
    : null;
  const derived = createTypeNode<RuntimeTypeNode>(
    source.name,
    parent,
    source.fromUnknown,
    source.is,
    source[outputValidationSymbol],
    source[fromSymbol],
    source[encoderSymbol],
    source[getRuntimeTypeIssuesSymbol],
    undefined,
    formatIssue,
  );

  // Preserve feature reflection such as element, props, members, and output.
  for (const key of Reflect.ownKeys(source)) {
    if (globalThis.Object.hasOwn(derived, key)) continue;

    globalThis.Object.defineProperty(
      derived,
      key,
      globalThis.Object.getOwnPropertyDescriptor(source, key)!,
    );
  }

  localizedTypeBySource.set(source, derived);
  return derived;
};

/* eslint-disable @typescript-eslint/consistent-indexed-object-style -- This
mapped return type is cheaper than the equivalent Readonly<Record<...>>. Changes
are measured by `pnpm bench:type`. */
type LocalizeTypes = <
  const TypesByName extends Readonly<Record<string, ConcreteTypeNode>>,
  const Locale extends string,
>(
  typesByName: TypesByName,
  formatErrorByTypeByLocale: Readonly<
    Record<
      Locale,
      FormatErrorByType<InferErrors<TypesByName[keyof TypesByName]>>
    >
  >,
) => {
  readonly [Name in Locale]: TypesByName;
};
/* eslint-enable @typescript-eslint/consistent-indexed-object-style */

type FormatErrorByType<Error extends TypeError> = Readonly<{
  [Entry in LocalizedErrorEntry<Error> as Entry["name"]]: TypeErrorFormatter<
    Extract<
      LocalizedErrorEntry<Error>,
      { readonly name: Entry["name"] }
    >["error"]
  >;
}>;

type LocalizedErrorEntry<
  Error extends TypeError,
  Seen extends TypeError = never,
> = Error extends TypeError
  ? [Error] extends [Seen]
    ? never
    : Error extends TypeOfError<infer Name>
      ? LocalizedErrorEntryValue<Name, Error>
      : Error extends {
            readonly outputError: infer OutputError extends TypeError;
          }
        ? LocalizedErrorEntry<OutputError, Seen | Error>
        : Error extends { readonly type: "Union" }
          ? LocalizedErrorEntryValue<"Union", Error>
          : Error extends { readonly type: "DiscriminatedUnion" }
            ? LocalizedDiscriminatedUnionErrorEntry<Error, Seen | Error>
            : Error extends {
                  readonly type: infer Name extends
                    "Array" | "Tuple" | "Record";
                  readonly reason: infer Reason;
                }
              ? | LocalizedErrorEntryValue<Name, Error>
                | LocalizedIssuesErrorEntry<Reason, Seen | Error>
              : Error extends {
                    readonly type: "Object";
                    readonly reason: infer Reason;
                  }
                ? | LocalizedErrorEntryValue<"Object", Error>
                  | LocalizedObjectErrorEntry<Reason, Seen | Error>
                : LocalizedErrorEntryValue<Error["type"], Error>
  : never;

interface LocalizedErrorEntryValue<
  Name extends TypeName,
  Error extends TypeError,
> {
  readonly name: Name;
  readonly error: Error;
}

type LocalizedIssuesErrorEntry<
  Reason,
  Seen extends TypeError,
> = Reason extends {
  readonly issues: ReadonlyArray<infer Issue>;
}
  ? Issue extends { readonly error: infer Error extends TypeError }
    ? LocalizedErrorEntry<Error, Seen>
    : never
  : never;

type LocalizedObjectErrorEntry<
  Reason,
  Seen extends TypeError,
> = Reason extends {
  readonly kind: "Properties";
  readonly errors: infer Errors;
}
  ? LocalizedErrorEntry<
      Exclude<
        Extract<LocalizedObjectErrorValue<Errors>, TypeError>,
        | ObjectMissingPropertyError
        | ObjectPropertyAccessError
        | ObjectExcessPropertyError
      >,
      Seen
    >
  : never;

type LocalizedObjectErrorValue<Errors> = Errors extends object
  ? Errors[keyof Errors]
  : never;

type LocalizedDiscriminatedUnionErrorEntry<
  Error extends TypeError,
  Seen extends TypeError,
> = Error extends {
  readonly reason: {
    readonly kind: "Member";
    readonly error: infer MemberError extends TypeError;
  };
}
  ? LocalizedErrorEntry<MemberError, Seen>
  : LocalizedErrorEntryValue<"DiscriminatedUnion", Error>;

declare const concreteTypeSymbol: unique symbol;
declare const errorsSymbol: unique symbol;
declare const customFromSymbol: unique symbol;

/** The union of errors a {@link Type} can return from `fromUnknown`. */
export type InferErrors<T extends TypeNode> = T[typeof errorsSymbol];

type RootType<T extends TypeNode> = T extends {
  readonly parent: infer Parent extends TypeNode;
}
  ? RootType<Parent>
  : T;

/**
 * The operation itself accepts the current Type Output. Its first `.parent`
 * accepts the immediate parent Output, and each additional suffix moves toward
 * the root, including the root Output boundary.
 *
 * This declaration family is intentionally more complex than its semantics
 * require to reduce TypeScript compiler work. Changes are measured by `pnpm
 * bench:type`.
 */
type FromOperation<
  Output,
  Error extends TypeError,
  Parent extends TypeNode,
> = TypeOperationFn<"from", Output, Output, never> &
  FromParentOperations<Output, Error, Parent>;

type CustomFromOperation = (...args: ReadonlyArray<never>) => unknown;

type ChildCustomFrom<
  ParentType extends TypeNode,
  Output,
  Error extends TypeError,
> = [ParentType[typeof customFromSymbol]] extends [never]
  ? never
  : [ParentType[typeof customFromSymbol]] extends [CustomFromOperation]
    ? ChildFromOperation<ParentType, Output, Error>
    : never;

type ChildFromOperation<
  ParentType extends TypeNode,
  Output,
  Error extends TypeError,
> = TypeOperationFn<"from", Output, Output, never> & {
  readonly parent: TypeOperationFn<
    "from",
    ParentType["Output"],
    Output,
    Error
  > &
    ChildFromParentOperations<TypeFromOperation<ParentType>, Output, Error>;
};

type ChildFromParentOperations<
  Operation,
  Output,
  Error extends TypeError,
> = Operation extends { readonly parent: infer ParentOperation }
  ? {
      readonly parent: TypeOperationFn<
        "from",
        FromOperationInput<ParentOperation>,
        Output,
        Error | FromOperationError<ParentOperation>
      > &
        ChildFromParentOperations<ParentOperation, Output, Error>;
    }
  : unknown;

type TypeFromOperation<T extends TypeNode> = T extends {
  readonly from: infer Operation;
}
  ? Operation
  : never;

type FromOperationInput<Operation> = Operation extends (
  value: infer Input,
  options?: ValidationOptions,
) => unknown
  ? Input
  : never;

type FromOperationError<Operation> = Operation extends (
  ...args: ReadonlyArray<never>
) => infer Return
  ? Return extends {
      readonly ok: false;
      readonly error: infer Error extends TypeError;
    }
    ? Error
    : never
  : never;

type DeepestFromOperation<Operation> = Operation extends {
  readonly parent: infer ParentOperation;
}
  ? DeepestFromOperation<ParentOperation>
  : Operation;

type NonRootErrors<T extends TypeNode> = T extends {
  readonly parent: infer Parent extends TypeNode;
}
  ? T["Error"] | NonRootErrors<Parent>
  : never;

interface FromParentOperations<
  Output,
  Error extends TypeError,
  Boundary extends TypeNode,
> {
  readonly parent: TypeOperationFn<"from", Boundary["Output"], Output, Error> &
    ([Boundary["parent"]] extends [infer Parent extends TypeNode]
      ? FromParentOperations<Output, Error | Boundary["Error"], Parent>
      : unknown);
}

type TypeOperationFn<
  Kind extends "from" | "orThrow" | "orNull",
  Input,
  Output,
  Error extends TypeError,
> = Kind extends "orNull"
  ? (value: Input) => Output | null
  : (
      value: Input,
      options?: ValidationOptions,
    ) => Kind extends "from" ? Result<Output, Error> : Output;

/** Configures how container {@link Type} operations report errors. */
export interface ValidationOptions {
  /** Controls whether container {@link Type} operations return one or all errors. */
  readonly errors: "first" | "all";
}

// Keeps partially erased TypeNode values out of Type composition without
// recursively analyzing parent chains. Changes are measured by
// `pnpm bench:type`.
type ConcreteTypeNode = TypeNode & { readonly [concreteTypeSymbol]: true };

declare const validationFailureSymbol: unique symbol;

interface ValidationFailure<Error> {
  readonly [validationFailureSymbol]: Error;
}

type ValidateParent<T extends ConcreteTypeNode> =
  IsUnion<T> extends false
    ? T
    : CompileTimeError<
        "Type",
        "Parent must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
      >;

type ValidateOutput<T extends ConcreteTypeNode> =
  IsUnion<T> extends false
    ? T
    : CompileTimeError<
        "Type",
        "Output Type must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
      >;

type ValidateConcreteTypeName<Name extends TypeName> =
  IsTypeNameUnion<Name> extends false
    ? {} extends Readonly<Record<Name, never>>
      ? ConcreteChildTypeNameError
      : Name
    : ConcreteChildTypeNameError;

type ValidateChildTypeName<
  Name extends TypeName,
  ParentType extends TypeNode,
> = [ChildTypeNameValidationError<Name, ParentType>] extends [never]
  ? Name
  : ChildTypeNameValidationError<Name, ParentType>;

type ChildTypeNameValidationError<
  Name extends TypeName,
  ParentType extends TypeNode,
> =
  IsTypeNameUnion<Name> extends true
    ? ConcreteChildTypeNameError
    : {} extends Readonly<Record<Name, never>>
      ? ConcreteChildTypeNameError
      : Name extends InferErrors<ParentType>["type"]
        ? ChildTypeNameCollisionError
        : never;

type IsTypeNameUnion<Name extends TypeName, Whole = Name> = Name extends Whole
  ? [Whole] extends [Name]
    ? false
    : true
  : never;

type ChildTypeNameCollisionError = CompileTimeError<
  "Type",
  "Error type must not duplicate an error inherited from the parent Type."
>;

type ValidateBrandParent<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
> = ValidateParent<ParentType> &
  ([ChildTypeNameValidationError<Name, ParentType>] extends [never]
    ? unknown
    : ChildTypeNameValidationError<Name, ParentType>);

type ConcreteChildTypeNameError = CompileTimeError<
  "Type",
  "Name must be one concrete Type name."
>;

/**
 * Custom {@link Type}.
 *
 * `createType` is refinement-only. Use {@link transform} to change a value's
 * representation. On success, a validation callback must return the value it
 * received, narrowed to its output type, rather than a replacement value. This
 * includes replacements assignable to the same TypeScript type. The
 * identity-preserving contract is asserted at runtime. It lets structural Types
 * preserve their input values and makes encoding an identity step.
 *
 * Like all Type-construction callbacks, validation callbacks are trusted to
 * follow their declared TypeScript types. A `Result<_, never>` callback is
 * therefore trusted never to return an `Err`.
 *
 * An infallible child accepts every parent Output, so its Output remains the
 * parent Output. A fallible child can narrow that Output but cannot change its
 * representation.
 *
 * A root formatter handles the root validation error. A child formatter handles
 * only the error introduced by that child; inherited errors are formatted by
 * the parent Type automatically. A fallible child must have one concrete name;
 * its error's `type` must equal that name and must not duplicate an inherited
 * error type. An infallible child has no own error to format.
 */
export function createType<
  Name extends TypeName,
  Output,
  Error extends TypeError,
>(
  name: ValidateConcreteTypeName<Name>,
  fromUnknown: (value: unknown) => Result<Output, Error>,
  // Validation alone determines Error; broad formatters must not widen it.
  formatError: TypeErrorFormatter<NoInfer<Error>>,
): Type<Name, Output, Output, Error>;
export function createType<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
>(
  name: ValidateConcreteTypeName<Name>,
  parent: ValidateParent<ParentType>,
  fromParent: (
    value: ParentType["Output"],
  ) => Result<ParentType["Output"], never>,
): Type<
  Name,
  ParentType["Input"],
  ParentType["Output"],
  never,
  ParentType,
  InferErrors<ParentType>,
  ChildCustomFrom<ParentType, ParentType["Output"], never>
>;
export function createType<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
  Output extends ParentType["Output"],
  Error extends TypeError<Name>,
>(
  name: Name,
  parent: ValidateBrandParent<Name, ParentType>,
  fromParent: (value: ParentType["Output"]) => Result<Output, Error>,
  // Validation alone determines Error; broad formatters must not widen it.
  formatError: [Error] extends [never]
    ? never
    : TypeErrorFormatter<NoInfer<Error>>,
): Type<
  Name,
  ParentType["Input"],
  Output,
  Error,
  ParentType,
  Error | InferErrors<ParentType>,
  ChildCustomFrom<ParentType, Output, Error>
>;
export function createType(
  name: TypeName,
  fromUnknownOrParent: unknown,
  fromParentOrFormatError: unknown,
  formatError?: TypeErrorFormatter<TypeError>,
): TypeNode {
  return typeof fromUnknownOrParent === "function"
    ? createRootType(
        name,
        assertRefinementIdentity(
          fromUnknownOrParent as (value: unknown) => Result<unknown, TypeError>,
        ),
        fromParentOrFormatError as TypeErrorFormatter<TypeError>,
      )
    : createChildType(
        name,
        fromUnknownOrParent as RuntimeTypeNode,
        assertRefinementIdentity(
          fromParentOrFormatError as (
            value: unknown,
          ) => Result<unknown, TypeError>,
        ),
        formatError,
      );
}

const assertRefinementIdentity =
  (
    refinement: (value: unknown) => Result<unknown, TypeError>,
  ): ((value: unknown) => Result<unknown, TypeError>) =>
  (value) => {
    const result = refinement(value);
    if (result.ok) {
      assert(
        globalThis.Object.is(result.value, value),
        "A Type refinement must return its input.",
      );
    }
    return result;
  };

const createRootType = <Name extends TypeName, Output, Error extends TypeError>(
  name: Name,
  fromUnknown: (value: unknown) => Result<Output, Error>,
  formatError: TypeErrorFormatter<Error>,
  getTypeIssues?: RuntimeGetTypeIssues,
): Type<Name, Output, Output, Error> => {
  const runtimeFormatError = formatError as TypeErrorFormatter<TypeError>;
  const runtimeGetTypeIssues: RuntimeGetTypeIssues =
    getTypeIssues ??
    ((error) =>
      singleRuntimeTypeIssue(
        error.type === "TypeOf" ? name : error.type,
        error,
        runtimeFormatError,
      ));
  const is = (value: unknown): value is Output => fromUnknown(value).ok;
  const from: RuntimeOperation<Result<unknown, TypeError>> = (value: never) => {
    assertTypeOutput(is, fromUnknown, formatError, value);
    return ok(value);
  };
  const to = (value: never): unknown => {
    assertTypeOutput(is, fromUnknown, formatError, value);
    return value;
  };

  return {
    name,
    parent: null,
    fromUnknown,
    formatError,
    is,
    from,
    to,
    orThrow: to,
    orNull: to,
    "~standard": createStandardSchemaProps(
      fromUnknown,
      runtimeGetTypeIssues,
      formatDefaultRuntimeTypeIssue,
    ),
    [outputValidationSymbol]: fromUnknown,
    [fromSymbol]: ok,
    [encoderSymbol]: identity,
    [getRuntimeTypeIssuesSymbol]: runtimeGetTypeIssues,
  } as unknown as Type<Name, Output, Output, Error>;
};

const createChildType = <
  Name extends TypeName,
  ParentType extends TypeNode,
  Output extends ParentType["Output"],
  Error extends TypeError,
>(
  name: Name,
  parent: ParentType,
  fromParent: (value: ParentType["Output"]) => Result<Output, Error>,
  formatOwnError?: TypeErrorFormatter<Error>,
): Type<
  Name,
  ParentType["Input"],
  Output,
  Error,
  ParentType,
  Error | InferErrors<ParentType>,
  ChildCustomFrom<ParentType, Output, Error>
> => {
  const typeParent = parent as ParentType & RuntimeTypeNode;
  const validate = fromParent as (value: unknown) => Result<unknown, Error>;
  const mapFromParent = (result: Result<unknown, TypeError>) =>
    result.ok ? validate(result.value) : result;
  const defaultFormatter = formatOwnError! as TypeErrorFormatter<TypeError>;
  const getTypeIssues: RuntimeGetTypeIssues = formatOwnError
    ? (error, mode) =>
        error.type === name
          ? singleRuntimeTypeIssue(name, error, defaultFormatter)
          : typeParent[getRuntimeTypeIssuesSymbol](error, mode)
    : typeParent[getRuntimeTypeIssuesSymbol];

  const fromParentOperation = mapRuntimeOperations(
    typeParent[fromSymbol],
    (operation) => mapRuntimeResult(operation, mapFromParent),
  );
  const from = createFromOperation(fromParentOperation);

  const fromUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => mapFromParent(typeParent.fromUnknown(value, options));
  const validateOutput = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => mapFromParent(typeParent[outputValidationSymbol](value, options));
  const to = typeParent[encoderSymbol];

  return createTypeNode<
    Type<
      Name,
      ParentType["Input"],
      Output,
      Error,
      ParentType,
      Error | InferErrors<ParentType>,
      ChildCustomFrom<ParentType, Output, Error>
    >
  >(
    name,
    typeParent,
    fromUnknown,
    (value) => typeParent.is(value) && validate(value).ok,
    validateOutput,
    from,
    to,
    getTypeIssues,
  );
};

/**
 * Transform {@link Type}.
 *
 * `from` accepts the semantic Output. `from.parent` converts the parent Output
 * to the output Type Input, then runs the complete output Type pipeline. `to`
 * canonically encodes every output Type value before converting it back through
 * the parent Type. Transformation callbacks are Type construction code. Their
 * successful results are asserted against the declared boundary so a broken
 * callback fails as a developer error rather than becoming a validation error.
 * Like all Type-construction callbacks, they are trusted to follow their
 * declared TypeScript types. A `Result<_, never>` callback is therefore trusted
 * never to return an `Err`.
 *
 * Errors from the parent and the forward callback remain unchanged. A forward
 * callback error must use the transformation name as its type. Errors from the
 * output Type are nested in a {@link TransformOutputError} so formatting can be
 * delegated to that particular Type, so `outputError` is reserved for that
 * wrapper. When the forward callback is fallible, the final formatter argument
 * formats only that callback's own errors. Parent and output Type errors use
 * their respective formatters automatically.
 *
 * ### Example
 *
 * ```ts
 * import { Number, String, ok, transform } from "@evolu/common";
 *
 * const NumberFromString = transform("NumberFromString", String, Number, {
 *   from: (value) => ok(globalThis.Number(value)),
 *   to: globalThis.String,
 * });
 *
 * expectOk(NumberFromString.from.parent("42"), 42);
 * assert(NumberFromString.to(42) === "42");
 * ```
 */
export function transform<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
  OutputType extends ConcreteTypeNode,
>(
  name: ValidateChildTypeName<Name, ParentType>,
  parent: ValidateParent<ParentType>,
  output: ValidateOutput<OutputType>,
  operations: {
    readonly from: (
      value: ParentType["Output"],
    ) => Result<OutputType["Input"], never>;
    readonly to: (value: OutputType["Input"]) => ParentType["Output"];
  },
): TransformType<ParentType, OutputType, Name, never>;
export function transform<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
  OutputType extends ConcreteTypeNode,
  FromError extends {
    readonly type: Name;
    readonly outputError?: never;
  },
>(
  name: ValidateChildTypeName<Name, ParentType>,
  parent: ValidateParent<ParentType>,
  output: ValidateOutput<OutputType>,
  operations: {
    readonly from: (
      value: ParentType["Output"],
    ) => Result<OutputType["Input"], FromError>;
    readonly to: (value: OutputType["Input"]) => ParentType["Output"];
  },
  formatError: [FromError] extends [never]
    ? never
    : TypeErrorFormatter<NoInfer<FromError>>,
): TransformType<ParentType, OutputType, Name, FromError>;
export function transform(
  name: TypeName,
  parent: unknown,
  output: unknown,
  {
    from: transformFrom,
    to: transformTo,
  }: {
    readonly from: (value: unknown) => Result<unknown, TypeError>;
    readonly to: (value: unknown) => unknown;
  },
  formatOwnError?: TypeErrorFormatter<TypeError>,
): TypeNode {
  const typeParent = parent as RuntimeTypeNode;
  const typeOutput = output as RuntimeTypeNode;
  const outputFromInput = getTerminalRuntimeNode(typeOutput.from);
  const fromOwn: RuntimeOperation<Result<unknown, TypeError>> = (
    value: never,
    options,
  ) =>
    flatMapResult(transformFrom(value), (value) => {
      const result = outputFromInput(value as never, options);

      return result.ok
        ? result
        : err({ type: name, outputError: result.error });
    });
  const fromParent = mapRuntimeOperations(
    typeParent[fromSymbol],
    (operation) => (value: never, options) =>
      flatMapResult(operation(value, options), (value) =>
        fromOwn(value as never, options),
      ),
  );
  const from = createFromOperation(fromParent);

  const fromUnknown = (value: unknown, options = firstValidationOptions) =>
    flatMapResult(typeParent.fromUnknown(value, options), (value) =>
      fromOwn(value as never, options),
    );
  const to: RuntimeEncoder = (value: never) => {
    const parentValue = transformTo(typeOutput[encoderSymbol](value));
    assertTypeOutput(
      typeParent.is,
      typeParent[outputValidationSymbol],
      typeParent.formatError,
      parentValue,
    );
    return typeParent[encoderSymbol](parentValue as never);
  };
  const defaultFormatter = formatOwnError!;
  const getTypeIssues: RuntimeGetTypeIssues = (error, mode) => {
    if (error.type !== name) {
      return typeParent[getRuntimeTypeIssuesSymbol](error, mode);
    }
    if ("outputError" in error) {
      return typeOutput[getRuntimeTypeIssuesSymbol](
        error.outputError as TypeError,
        mode,
      );
    }
    return singleRuntimeTypeIssue(name, error, defaultFormatter);
  };
  const validateOutput: RuntimeOutputValidation = (value, options) => {
    const result = typeOutput[outputValidationSymbol](value, options);

    return result.ok ? result : err({ type: name, outputError: result.error });
  };
  return createTypeNode(
    name,
    typeParent,
    fromUnknown,
    typeOutput.is,
    validateOutput,
    from,
    to,
    getTypeIssues,
    { output: typeOutput },
  );
}

export interface TransformType<
  ParentType extends TypeNode,
  OutputType extends TypeNode,
  Name extends TypeName,
  FromError extends TypeError<Name>,
> extends Type<
  Name,
  ParentType["Input"],
  OutputType["Output"],
  TransformError<Name, FromError, TypeFromError<OutputType>>,
  ParentType,
  | TransformError<Name, FromError, TypeFromError<OutputType>>
  | InferErrors<ParentType>,
  ChildCustomFrom<
    ParentType,
    OutputType["Output"],
    TransformError<Name, FromError, TypeFromError<OutputType>>
  >
> {
  readonly output: OutputType;
}

export type TransformError<
  Name extends TypeName,
  OwnError extends TypeError<Name>,
  OutputError extends TypeError,
> =
  | OwnError
  | ([OutputError] extends [never]
      ? never
      : TransformOutputError<Name, OutputError>);

/** Wraps an error produced by the output {@link Type} of {@link transform}. */
export interface TransformOutputError<
  Name extends TypeName,
  OutputError extends TypeError,
> extends TypeError<Name> {
  /** The error returned by the output Type. */
  readonly outputError: OutputError;
}

type DeepestFromError<Operation> =
  DeepestFromOperation<Operation> extends (
    ...args: ReadonlyArray<never>
  ) => infer R
    ? R extends {
        readonly ok: false;
        readonly error: infer Error extends TypeError;
      }
      ? Error
      : never
    : never;

type TypeFromError<T extends TypeNode> =
  unknown extends T[typeof customFromSymbol]
    ? DeepestFromError<TypeFromOperation<T>>
    : [T[typeof customFromSymbol]] extends [never]
      ? NonRootErrors<T>
      : DeepestFromError<T[typeof customFromSymbol]>;

const firstValidationOptions: ValidationOptions = { errors: "first" };
const allValidationOptions: ValidationOptions = { errors: "all" };

type RuntimeOperationFn<Value> = (
  value: never,
  options?: ValidationOptions,
) => Value;

type RuntimeOperation<Value> = RuntimeOperationFn<Value> & {
  parent?: RuntimeOperation<Value>;
};

type RuntimeEncoder = (value: never) => unknown;

declare const encoderSymbolType: unique symbol;
declare const fromSymbolType: unique symbol;
const encoderSymbol: typeof encoderSymbolType =
  /*#__PURE__*/ globalThis.Symbol() as typeof encoderSymbolType;
const fromSymbol: typeof fromSymbolType =
  /*#__PURE__*/ globalThis.Symbol() as typeof fromSymbolType;

/**
 * Type-erased {@link Type} used to traverse and invoke heterogeneous Type nodes
 * at runtime.
 */
type RuntimeTypeNode = Omit<TypeNode, typeof customFromSymbol> & {
  readonly [customFromSymbol]: never;
  readonly fromUnknown: (
    value: unknown,
    options: ValidationOptions,
  ) => Result<unknown, TypeError>;
  readonly formatError: TypeErrorFormatter<TypeError>;
  readonly from: RuntimeOperation<Result<unknown, TypeError>>;
  readonly to: RuntimeEncoder;
  readonly [outputValidationSymbolType]: RuntimeOutputValidation;
  readonly [fromSymbolType]: RuntimeOperation<Result<unknown, TypeError>>;
  // Composed encoders reuse the implementation after their enclosing Output
  // assertion, avoiding repeated validation and preserving identity fast paths.
  readonly [encoderSymbolType]: RuntimeEncoder;
  readonly [getRuntimeTypeIssuesSymbolType]: RuntimeGetTypeIssues;
};

const mapRuntimeResult =
  <Input, Output>(
    operation: RuntimeOperation<Input>,
    map: (value: Input) => Output,
  ): RuntimeOperation<Output> =>
  (value: never, options = firstValidationOptions) =>
    map(operation(value, options));

// `map` must return a fresh operation because this function can attach `.parent`.
const mapRuntimeOperations = <Input, Output>(
  operation: RuntimeOperation<Input>,
  map: (operation: RuntimeOperation<Input>) => RuntimeOperation<Output>,
): RuntimeOperation<Output> => {
  const mapped = map(operation);

  if (operation.parent) {
    mapped.parent = mapRuntimeOperations(operation.parent, map);
  }

  return mapped;
};

const createFromOperation = (
  parent?: RuntimeOperation<Result<unknown, TypeError>>,
): RuntimeOperation<Result<unknown, TypeError>> => {
  if (!parent) return ok;

  const from: RuntimeOperation<Result<unknown, TypeError>> = (value: never) =>
    ok(value);
  from.parent = parent;
  return from;
};

function getTerminalRuntimeNode<Value>(
  node: RuntimeOperation<Value>,
): RuntimeOperation<Value>;
function getTerminalRuntimeNode(node: RuntimeTypeNode): RuntimeTypeNode;
function getTerminalRuntimeNode(node: { readonly parent?: unknown }): unknown {
  while (node.parent) node = node.parent;

  return node;
}

const createTypeNode = <Node extends TypeNode = TypeNode>(
  name: Node["name"],
  parent: TypeNode | null,
  fromUnknown: (
    value: unknown,
    options?: ValidationOptions,
  ) => Result<unknown, TypeError>,
  is: (value: unknown) => boolean,
  validateOutput: RuntimeOutputValidation,
  from: RuntimeOperation<Result<unknown, TypeError>>,
  to: RuntimeEncoder,
  getTypeIssues: RuntimeGetTypeIssues,
  additionalProperties?: Omit<
    Node,
    | keyof TypeNode
    | typeof concreteTypeSymbol
    | "formatError"
    | "from"
    | "to"
    | "orThrow"
    | "orNull"
  >,
  formatIssue: RuntimeFormatTypeIssue = formatDefaultRuntimeTypeIssue,
): Node => {
  const runtimeParent = parent as RuntimeTypeNode | null;
  const runtimeFormatError: TypeErrorFormatter<TypeError> =
    runtimeParent?.[getRuntimeTypeIssuesSymbol] === getTypeIssues
      ? runtimeParent.formatError
      : (error) => formatIssue(getTypeIssues(error, "first")[0]);
  const typedFrom = addRuntimeAssertions(
    is,
    validateOutput,
    runtimeFormatError,
    parent,
    from,
  );

  const fromInput = getTerminalRuntimeNode(typedFrom);
  const typedTo: RuntimeEncoder = (value: never) => {
    assertTypeOutput(is, validateOutput, runtimeFormatError, value);
    return to(value);
  };

  const type = {
    name,
    parent,
    fromUnknown,
    formatError: runtimeFormatError,
    is,
    from: typedFrom,
    to: typedTo,
    orThrow: mapRuntimeResult(fromInput, getOrThrow),
    orNull: mapRuntimeResult(fromInput, getOrNull),
    "~standard": createStandardSchemaProps(
      fromUnknown,
      getTypeIssues,
      formatIssue,
    ),
    ...additionalProperties,
    [outputValidationSymbol]: validateOutput,
    [fromSymbol]: from,
    [encoderSymbol]: to,
    [getRuntimeTypeIssuesSymbol]: getTypeIssues,
  } as unknown as Node;

  return type;
};

const createStandardSchemaProps = (
  fromUnknown: (
    value: unknown,
    options?: ValidationOptions,
  ) => Result<unknown, TypeError>,
  getTypeIssues: RuntimeGetTypeIssues,
  formatIssue: RuntimeFormatTypeIssue,
): StandardSchemaV1.Props<unknown, unknown> => ({
  version: 1,
  vendor: "evolu",
  validate: (value) => {
    const result = fromUnknown(value, allValidationOptions);

    return result.ok
      ? { value: result.value }
      : {
          issues: getTypeIssues(result.error, "all").map((issue) => ({
            message: formatIssue(issue),
            path: issue.path,
          })),
        };
  },
});

const addRuntimeAssertions = (
  is: (value: unknown) => boolean,
  validateOutput: RuntimeOutputValidation,
  formatError: TypeErrorFormatter<TypeError>,
  parent: TypeNode | null,
  operation: RuntimeOperation<Result<unknown, TypeError>>,
): RuntimeOperation<Result<unknown, TypeError>> => {
  const asserted: RuntimeOperation<Result<unknown, TypeError>> = (
    value: never,
    options = firstValidationOptions,
  ) => {
    assertTypeOutput(is, validateOutput, formatError, value, options);
    return operation(value, options);
  };

  if (operation.parent) {
    const typeParent = parent!;
    const runtimeParent = typeParent as RuntimeTypeNode;
    asserted.parent = addRuntimeAssertions(
      runtimeParent.is,
      runtimeParent[outputValidationSymbol],
      runtimeParent.formatError,
      runtimeParent.parent,
      operation.parent,
    );
  }

  return asserted;
};

export const Unknown = /*#__PURE__*/ createRootType<"Unknown", unknown, never>(
  "Unknown",
  ok,
  identity,
);

export const Never = /*#__PURE__*/ createRootType(
  "Never",
  (value): Result<never, NeverError> => err({ type: "Never", value }),
  (error) =>
    `A value ${safelyStringifyUnknownValue(error.value)} is not valid for type Never.`,
);

export interface NeverError extends TypeError<"Never"> {
  readonly value: unknown;
}

const createTypeOfType = <Name extends keyof TypeOfOutputByName>(
  name: Name,
): Type<
  Name,
  TypeOfOutputByName[Name],
  TypeOfOutputByName[Name],
  TypeOfError<Name>
> => {
  const typeOf = name.toLowerCase() as Lowercase<Name>;

  return createRootType(
    name,
    (value): Result<TypeOfOutputByName[Name], TypeOfError<Name>> =>
      typeof value === typeOf
        ? ok(value as TypeOfOutputByName[Name])
        : err({ type: "TypeOf", expected: name, value }),
    (error) =>
      `A value ${safelyStringifyUnknownValue(error.value)} is not a ${typeOf}.`,
  );
};

interface TypeOfOutputByName {
  readonly String: string;
  readonly Number: number;
  readonly BigInt: bigint;
  readonly Boolean: boolean;
  readonly Symbol: symbol;
  readonly Function: globalThis.Function;
}

export interface TypeOfError<
  Name extends keyof TypeOfOutputByName,
> extends TypeError<"TypeOf"> {
  readonly expected: Name;
  readonly value: unknown;
}

/**
 * A JavaScript string {@link Type} without additional constraints.
 *
 * Use when empty strings and surrounding whitespace are valid domain values. If
 * only empty strings are invalid, add an explicit {@link minLength}. If
 * surrounding whitespace is invalid, use {@link TrimmedString}. If both are
 * invalid, use {@link NonEmptyTrimmedString}, the recommended base for ordinary
 * human-entered text.
 *
 * ### Example
 *
 * A bounded wire value for a protocol that explicitly permits an empty value
 * and significant whitespace:
 *
 * ```ts
 * import { String, maxLength, type Brand } from "@evolu/common";
 *
 * const WireValue100 = maxLength(100)(String);
 * type WireValue100 = typeof WireValue100.Output;
 *
 * expectTypeOf<WireValue100>().toEqualTypeOf<
 *   string & Brand<"MaxLength100">
 * >();
 * ```
 */
export const String = /*#__PURE__*/ createTypeOfType("String");

export const Number = /*#__PURE__*/ createTypeOfType("Number");

export const BigInt = /*#__PURE__*/ createTypeOfType("BigInt");

export const Boolean = /*#__PURE__*/ createTypeOfType("Boolean");

export const Symbol = /*#__PURE__*/ createTypeOfType("Symbol");

export const Function = /*#__PURE__*/ createTypeOfType("Function");

/**
 * Creates a {@link Type} for instances of one constructor.
 *
 * Membership uses the intrinsic prototype chain, so subclasses are accepted,
 * equivalent constructors from other realms are rejected, and custom
 * `Symbol.hasInstance` implementations are ignored.
 *
 * Use {@link object} instead when only the structure matters.
 *
 * ### Example
 *
 * ```ts
 * import { createInstanceOfType } from "@evolu/common";
 *
 * class User {
 *   readonly name: string;
 *
 *   constructor(name: string) {
 *     this.name = name;
 *   }
 * }
 *
 * const UserInstance = createInstanceOfType(User);
 *
 * assert(UserInstance.is(new User("Ada")));
 * assert(!UserInstance.is({ name: "Ada" }));
 * ```
 */
export const createInstanceOfType = <Constructor extends InstanceConstructor>(
  constructor: ValidateInstanceConstructor<Constructor>,
): InstanceOfType<Constructor> => {
  const concreteConstructor = constructor as Constructor;
  const constructorName = concreteConstructor.name;
  const is = (value: unknown): value is InstanceOfOutput<Constructor> =>
    globalThis.Function.prototype[globalThis.Symbol.hasInstance].call(
      concreteConstructor,
      value,
    );
  const fromUnknown = (
    value: unknown,
  ): Result<InstanceOfOutput<Constructor>, InstanceOfError> =>
    is(value) ? ok(value) : err({ type: "InstanceOf", constructorName, value });

  return globalThis.Object.assign(
    createRootType(
      "InstanceOf",
      fromUnknown,
      (error) =>
        `A value ${safelyStringifyUnknownValue(error.value)} is not an instance of ${error.constructorName}.`,
    ),
    { constructor: concreteConstructor },
  );
};

/** A JavaScript class constructor accepted by {@link createInstanceOfType}. */
export type InstanceConstructor<Instance extends object = object> =
  (abstract new (...args: ReadonlyArray<never>) => Instance) & {
    readonly name: string;
  };

export interface InstanceOfType<
  Constructor extends InstanceConstructor,
> extends Type<
  "InstanceOf",
  InstanceOfOutput<Constructor>,
  InstanceOfOutput<Constructor>,
  InstanceOfError
> {
  readonly constructor: Constructor;
}

type InstanceOfOutput<Constructor extends InstanceConstructor> =
  Constructor extends { readonly prototype: infer Output extends object }
    ? Output
    : InstanceType<Constructor>;

export interface InstanceOfError extends TypeValueError<"InstanceOf"> {
  readonly constructorName: string;
}

type ValidateInstanceConstructor<Constructor extends InstanceConstructor> =
  IsUnion<Constructor> extends false
    ? "prototype" extends keyof Constructor
      ? Constructor
      : InstanceConstructorCompileTimeError
    : InstanceConstructorCompileTimeError;

type InstanceConstructorCompileTimeError = CompileTimeError<
  "Type",
  "Constructor must preserve one concrete constructor. Create a Union Type from separate Instance Types instead of passing a union or erased constructor."
>;

/** A same-realm JavaScript Date Instance {@link Type}. */
export const Date = /*#__PURE__*/ (() =>
  createInstanceOfType(globalThis.Date))();

/** A same-realm JavaScript Uint8Array Instance {@link Type}. */
export const Uint8Array = /*#__PURE__*/ (() =>
  createInstanceOfType(globalThis.Uint8Array))();

/** A same-realm JavaScript ArrayBuffer Instance {@link Type}. */
export const ArrayBuffer = /*#__PURE__*/ (() =>
  createInstanceOfType(globalThis.ArrayBuffer))();

/**
 * Literal {@link Type}.
 *
 * {@link String}, {@link Number}, {@link BigInt}, and {@link Boolean} literal Types
 * are children of their corresponding primitive Types and accept the widened
 * primitive through `from.parent`. The expected value must have one exact
 * literal type. Validation uses `===`, so `-0` matches `0`.
 */
export const literal = <const Expected extends Literal>(
  expected: ValidateLiteral<Expected>,
): LiteralType<Expected> => {
  const literalExpected = expected as Expected;

  const validate = (
    value: unknown,
  ): Result<Expected, LiteralError<Expected>> =>
    value === literalExpected
      ? ok(value as Expected)
      : err({ type: "Literal", expected: literalExpected, value });

  const parent =
    typeof literalExpected === "string"
      ? String
      : typeof literalExpected === "number"
        ? Number
        : typeof literalExpected === "bigint"
          ? BigInt
          : typeof literalExpected === "boolean"
            ? Boolean
            : null;
  const formatError: TypeErrorFormatter<LiteralError<Expected>> = (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not strictly equal to the expected literal: ${globalThis.String(error.expected)}.`;

  return globalThis.Object.assign(
    parent
      ? createChildType(
          "Literal",
          parent as unknown as RuntimeTypeNode,
          validate,
          formatError,
        )
      : createRootType("Literal", validate, formatError),
    { expected: literalExpected },
  ) as unknown as LiteralType<Expected>;
};

export interface LiteralType<Expected extends Literal> extends Type<
  "Literal",
  WidenLiteral<Expected>,
  Expected,
  LiteralError<Expected>,
  LiteralParent<Expected>
> {
  readonly expected: Expected;
}

type LiteralParent<Expected extends Literal> = Expected extends string
  ? typeof String
  : Expected extends number
    ? typeof Number
    : Expected extends bigint
      ? typeof BigInt
      : Expected extends boolean
        ? typeof Boolean
        : null;

type ValidateLiteral<Expected extends Literal> =
  IsUnion<Expected> extends false
    ? {} extends Readonly<Record<`${Expected}`, never>>
      ? LiteralCompileTimeError
      : Expected
    : LiteralCompileTimeError;

type LiteralCompileTimeError = CompileTimeError<
  "Type",
  "Expected must be one concrete literal value."
>;

export interface LiteralError<
  Expected extends Literal = Literal,
> extends TypeError<"Literal"> {
  readonly expected: Expected;
  readonly value: unknown;
}

export const Undefined = /*#__PURE__*/ literal(undefined);

export const Null = /*#__PURE__*/ literal(null);

/**
 * Union {@link Type}.
 *
 * Use `union(A, B)` when a value may match any one of several Types. Literal
 * values can be passed directly as shorthand for their corresponding
 * {@link LiteralType | Literal Types}.
 *
 * For {@link ObjectType | Object variants} with a required literal
 * discriminator, use {@link discriminatedUnion}. It selects the matching member
 * by its discriminator instead of trying every member.
 *
 * `fromUnknown` tries each member's complete pipeline in argument order and
 * returns the first successful result. `from` accepts the Union Output.
 * `from.parent` accepts a root member Output, selects members whose root `is`
 * accepts the value, and runs their remaining stages on the original typed
 * value.
 *
 * If every member fails, the error identifies each retained failure by its
 * member index. By default, only the first member failure is retained. Pass `{
 * errors: "all" }` to retain every member failure and collect nested errors
 * within each member.
 *
 * Member order matters when multiple members accept the same value: validation
 * and encoding use the first matching member.
 *
 * ### Example
 *
 * ```ts
 * import { Number, String, union } from "@evolu/common";
 *
 * const Status = union("draft", "published");
 * const StatusOrCode = union("draft", "published", Number);
 *
 * expectOk(Status.fromUnknown("draft"), "draft");
 * expectOk(StatusOrCode.fromUnknown(42), 42);
 *
 * const TextOrNumber = union(String, Number);
 *
 * expectErr(TextOrNumber.fromUnknown(true, { errors: "all" }), {
 *   type: "Union",
 *   errors: [
 *     {
 *       index: 0,
 *       error: { type: "TypeOf", expected: "String", value: true },
 *     },
 *     {
 *       index: 1,
 *       error: { type: "TypeOf", expected: "Number", value: true },
 *     },
 *   ],
 * });
 * ```
 */
export function union<const Expected extends AtLeastTwoReadonlyArray<Literal>>(
  ...expected: {
    readonly [Index in keyof Expected]: ValidateLiteral<Expected[Index]>;
  }
): UnionType<{
  readonly [Index in keyof Expected]: LiteralType<Expected[Index]>;
}>;
export function union<const Members extends AtLeastTwoReadonlyArray<TypeNode>>(
  ...members: {
    readonly [Index in keyof Members]: ValidateUnionTypeMember<Members[Index]>;
  }
): UnionType<Members>;
export function union<
  const Members extends AtLeastTwoReadonlyArray<TypeNode | Literal>,
>(
  ...members: {
    readonly [Index in keyof Members]: ValidateUnionMember<Members[Index]>;
  }
): UnionType<NormalizeUnionMembers<Members>>;
export function union(
  ...typesOrLiterals: ReadonlyArray<TypeNode | Literal>
): TypeNode {
  const members = typesOrLiterals.map((typeOrLiteral) =>
    typeOrLiteral !== null && typeof typeOrLiteral === "object"
      ? typeOrLiteral
      : literal(typeOrLiteral as never),
  ) as unknown as AtLeastTwoReadonlyArray<RuntimeTypeNode>;
  const inputMembers = members.map(getTerminalRuntimeNode);
  const inputFrom = createUnionValidation(
    inputMembers,
    (member, value, options) => member.fromUnknown(value, options),
  );
  const inputValidateOutput = createUnionValidation(
    inputMembers,
    (member, value, options) => member[outputValidationSymbol](value, options),
  );
  const defaultFormatter = formatUnionError as TypeErrorFormatter<TypeError>;
  const getTypeIssues: RuntimeGetTypeIssues = (error) =>
    singleRuntimeTypeIssue("Union", error, defaultFormatter);
  const input = createTypeNode<
    UnionInputType<unknown, UnionErrorValue<TypeError>>
  >(
    "Union",
    null,
    inputFrom,
    (value) => inputMembers.some((member) => member.is(value)),
    inputValidateOutput,
    ok,
    identity,
    getTypeIssues,
  );
  const fromUnknown = createUnionValidation(members, (member, value, options) =>
    member.fromUnknown(value, options),
  );
  const validateOutput = createUnionValidation(
    members,
    (member, value, options) => member[outputValidationSymbol](value, options),
  );
  const memberFromInputs = members.map((member) =>
    getTerminalRuntimeNode(member[fromSymbol]),
  );
  const fromParent = createUnionValidation(
    members,
    (_member, value, options, index) =>
      inputMembers[index].is(value)
        ? memberFromInputs[index](value as never, options)
        : undefined,
  );
  const getOutputMember = (value: unknown) =>
    members.find((member) => member.is(value));
  const from = createFromOperation(fromParent);
  const to: RuntimeEncoder = (value: never) => {
    const member = getOutputMember(value);

    assertNonNullable(member);
    return member[encoderSymbol](value);
  };

  return createTypeNode<UnionType<AtLeastTwoReadonlyArray<TypeNode>>>(
    "Union",
    input,
    fromUnknown,
    (value) => members.some((member) => member.is(value)),
    validateOutput,
    from,
    to,
    getTypeIssues,
    { members },
  );
}

const formatUnionError: TypeErrorFormatter<UnionErrorValue<TypeError>> = () =>
  "A value does not match any union member.";

const createUnionValidation =
  (
    members: ReadonlyArray<RuntimeTypeNode>,
    validateMember: (
      member: RuntimeTypeNode,
      value: unknown,
      options: ValidationOptions,
      index: number,
    ) => Result<unknown, TypeError> | undefined,
  ): ((
    value: unknown,
    options?: ValidationOptions,
  ) => Result<unknown, UnionErrorValue<TypeError>>) =>
  (value: unknown, options: ValidationOptions = firstValidationOptions) => {
    let errors: Array<UnionMemberError<TypeError>> | undefined;

    for (let index = 0; index < members.length; index++) {
      const result = validateMember(members[index], value, options, index);

      if (result === undefined) continue;
      if (result.ok) return result;

      if (errors === undefined || options.errors === "all") {
        (errors ??= []).push({ index, error: result.error });
      }
    }

    assertNonNullable(errors);
    return err({
      type: "Union",
      errors: errors as unknown as NonEmptyReadonlyArray<
        UnionMemberError<TypeError>
      >,
    });
  };

/**
 * Shorthand for passing a {@link Type} and `undefined` to {@link union}.
 *
 * This does not make an object property optional. It changes only the values
 * accepted when the property is present.
 */
export const undefinedOr = <ValueType extends TypeNode>(
  type: ValidateUnionTypeMember<ValueType>,
): UnionType<readonly [ValueType, typeof Undefined]> => union(type, Undefined);

/** Shorthand for passing a {@link Type} and `null` to {@link union}. */
export const nullOr = <ValueType extends TypeNode>(
  type: ValidateUnionTypeMember<ValueType>,
): UnionType<readonly [ValueType, typeof Null]> => union(type, Null);

/** Shorthand for passing a {@link Type}, `null`, and `undefined` to {@link union}. */
export const nullishOr = <ValueType extends TypeNode>(
  type: ValidateUnionTypeMember<ValueType>,
): UnionType<readonly [ValueType, typeof Null, typeof Undefined]> =>
  union(type, Null, Undefined);

// Homogeneous overloads above avoid this mapped normalization for common wide
// unions. Changes are measured by `pnpm bench:type`.
type ValidateUnionMember<Member extends TypeNode | Literal> = [Member] extends [
  TypeNode,
]
  ? ValidateUnionTypeMember<Member>
  : [Member] extends [Literal]
    ? ValidateLiteral<Member>
    : never;

type ValidateUnionTypeMember<Member extends TypeNode> =
  IsUnion<Member> extends false
    ? [Member] extends [ConcreteTypeNode]
      ? Member
      : UnionMemberConcreteTypeError
    : UnionMemberConcreteTypeError;

type UnionMemberConcreteTypeError = CompileTimeError<
  "Type",
  "Union member must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
>;

type NormalizeUnionMembers<
  Members extends AtLeastTwoReadonlyArray<TypeNode | Literal>,
> = {
  readonly [Index in keyof Members]: Members[Index] extends TypeNode
    ? Members[Index]
    : Members[Index] extends Literal
      ? LiteralType<Members[Index]>
      : never;
} extends infer Normalized extends AtLeastTwoReadonlyArray<TypeNode>
  ? Normalized
  : never;

export interface UnionType<
  Members extends AtLeastTwoReadonlyArray<TypeNode>,
> extends Type<
  "Union",
  Members[number]["Input"],
  Members[number]["Output"],
  UnionTypeError<Members>,
  UnionInputParent<Members>,
  UnionTypeError<Members>
> {
  readonly members: Members;
}

/** A root {@link Type} validating the encoded Inputs accepted by {@link union}. */
export type UnionInputType<Input, Error extends TypeError> = Type<
  "Union",
  Input,
  Input,
  Error
>;

type UnionInputParent<Members extends AtLeastTwoReadonlyArray<TypeNode>> =
  UnionMembersAreLiterals<Members> extends true
    ? LiteralUnionInputParent<Members>
    : UnionInputType<Members[number]["Input"], UnionInputTypeError<Members>>;

type LiteralUnionInputParent<
  Members extends AtLeastTwoReadonlyArray<TypeNode>,
  Parents = Members[number]["parent"],
> = [Parents] extends [infer Parent extends TypeNode]
  ? IsUnion<Parent> extends true
    ? UnionInputType<Members[number]["Input"], UnionInputTypeError<Members>>
    : UnionInputType<Members[number]["Input"], UnionError<InferErrors<Parent>>>
  : UnionInputType<Members[number]["Input"], UnionInputTypeError<Members>>;

// Index correlation adds information only when root member Types differ.
// Avoiding a mapped tuple for one shared root keeps wide input unions cheap.
// Changes are measured by `pnpm bench:type`.
type UnionInputTypeError<
  Members extends AtLeastTwoReadonlyArray<TypeNode>,
  RootMembers extends TypeNode = RootType<Members[number]>,
> =
  IsUnion<RootMembers> extends true
    ? UnionTypeError<RootUnionMembers<Members>>
    : UnionError<InferErrors<RootMembers>>;

type RootUnionMembers<Members extends AtLeastTwoReadonlyArray<TypeNode>> = {
  readonly [Index in keyof Members]: RootType<Members[Index]>;
} extends infer RootMembers extends AtLeastTwoReadonlyArray<TypeNode>
  ? RootMembers
  : never;

export type UnionError<
  Error extends TypeError = TypeError,
  MemberError extends UnionMemberError<Error> = UnionMemberError<Error>,
> = [Error] extends [never] ? never : UnionErrorValue<Error, MemberError>;

export interface UnionMemberError<
  Error extends TypeError,
  Index extends number = number,
> {
  readonly index: Index;
  readonly error: Error;
}

// Intentionally more complex than the union rule requires to reduce TypeScript
// compiler work for wide unions. Changes are measured by `pnpm bench:type`.
type UnionTypeError<Members extends AtLeastTwoReadonlyArray<TypeNode>> =
  UnionMembersAreLiterals<Members> extends true
    ? CorrelatedUnionError<Members>
    : [Extract<Members[number], InfallibleTypeNode>] extends [never]
      ? CorrelatedUnionError<Members>
      : true extends {
            readonly [Index in keyof Members]: [
              InferErrors<Members[Index]>,
            ] extends [never]
              ? true
              : false;
          }[number]
        ? never
        : CorrelatedUnionError<Members>;

type CorrelatedUnionError<Members extends AtLeastTwoReadonlyArray<TypeNode>> =
  UnionError<
    InferErrors<Members[number]>,
    {
      readonly [Index in keyof Members]: {
        readonly index: NumericTupleIndex<Index>;
        readonly error: InferErrors<Members[Index]>;
      };
    }[number]
  >;

type NumericTupleIndex<Index> = Index extends number
  ? Index
  : Index extends `${infer NumericIndex extends number}`
    ? NumericIndex
    : never;

type UnionMembersAreLiterals<
  Members extends AtLeastTwoReadonlyArray<TypeNode>,
> = Members[number] extends {
  readonly name: "Literal";
  readonly expected: Literal;
}
  ? true
  : false;

type InfallibleTypeNode = TypeNode & {
  readonly [errorsSymbol]: never;
};

interface UnionErrorValue<
  Error extends TypeError,
  MemberError extends UnionMemberError<Error> = UnionMemberError<Error>,
> extends TypeError<"Union"> {
  readonly errors: NonEmptyReadonlyArray<MemberError>;
}

/**
 * Branded {@link Type}.
 *
 * Branding is the recommended way to define domain-specific primitive Types in
 * Evolu. A {@link Brand} distinguishes values that share the same runtime
 * representation, preventing values with different meanings from being used
 * interchangeably.
 *
 * `brand` takes the name of the new Brand, the parent Type to brand, and an
 * optional validation callback for an additional constraint. Its Output retains
 * the parent Output and its brands, and adds the new Brand.
 *
 * Without a validation callback, the brand adds no errors and inherits its
 * parent's formatter. A validation callback returns `ok()` when the parent
 * value satisfies the constraint or an `Err` describing the failure. `brand`
 * always preserves the parent value; representation-changing work belongs in
 * {@link transform}. A fallible validation callback must format only the error
 * it introduces; inherited errors are formatted by the parent Type
 * automatically. A fallible brand's error `type` must equal the Brand name.
 *
 * ### Example
 *
 * A signed 64-bit integer:
 *
 * ```ts
 * import {
 *   BigInt,
 *   brand,
 *   err,
 *   ok,
 *   type Brand,
 *   type TypeError,
 * } from "@evolu/common";
 *
 * const Int64 = brand(
 *   "Int64",
 *   BigInt,
 *   (value) =>
 *     globalThis.BigInt.asIntN(64, value) === value
 *       ? ok()
 *       : err<Int64Error>({ type: "Int64", value }),
 *   () => "Expected a signed 64-bit integer.",
 * );
 * type Int64 = typeof Int64.Output;
 *
 * // Note the Brand.
 * expectTypeOf<Int64>().toEqualTypeOf<bigint & Brand<"Int64">>();
 *
 * interface Int64Error extends TypeError<"Int64"> {
 *   readonly value: bigint;
 * }
 *
 * expectOk(Int64.fromUnknown(42n), 42n);
 * expectErr(Int64.fromUnknown(2n ** 63n), {
 *   type: "Int64",
 *   value: 2n ** 63n,
 * });
 * ```
 *
 * To reuse a Brand constraint with different parent Types, define a
 * {@link BrandFactory}. Brand Factories can then be composed:
 *
 * ```ts
 * import {
 *   String,
 *   brand,
 *   err,
 *   minLength,
 *   ok,
 *   type Brand,
 *   type BrandFactory,
 *   type TypeError,
 * } from "@evolu/common";
 *
 * const trimmed: BrandFactory<"Trimmed", string, TrimmedError> = (
 *   parent,
 * ) =>
 *   brand(
 *     "Trimmed",
 *     parent,
 *     (value) =>
 *       value === value.trim()
 *         ? ok()
 *         : err<TrimmedError>({ type: "Trimmed", value }),
 *     () => "Expected a string without surrounding whitespace.",
 *   );
 *
 * const TrimmedString = trimmed(String);
 * type TrimmedString = typeof TrimmedString.Output;
 *
 * expectTypeOf<TrimmedString>().toEqualTypeOf<string & Brand<"Trimmed">>();
 *
 * const NonEmptyString = minLength(1)(String);
 * type NonEmptyString = typeof NonEmptyString.Output;
 *
 * expectTypeOf<NonEmptyString>().toEqualTypeOf<
 *   string & Brand<"MinLength1">
 * >();
 *
 * const NonEmptyTrimmedString = minLength(1)(TrimmedString);
 * type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Output;
 *
 * expectTypeOf<NonEmptyTrimmedString>().toEqualTypeOf<
 *   string & Brand<"Trimmed"> & Brand<"MinLength1">
 * >();
 *
 * interface TrimmedError extends TypeError<"Trimmed"> {
 *   readonly value: string;
 * }
 *
 * // Validation from unknown.
 * expectOk(NonEmptyTrimmedString.fromUnknown("Evolu"), "Evolu");
 *
 * // The typed input selects TrimmedString as the validated boundary.
 * expectOk(
 *   NonEmptyTrimmedString.from.parent(TrimmedString.orThrow("Evolu")),
 *   "Evolu",
 * );
 * ```
 */
export function brand<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
>(
  name: ValidateConcreteTypeName<Name>,
  parent: ValidateParent<ParentType>,
  validate?: (value: ParentType["Output"]) => Result<void, never>,
): BrandType<ParentType, Name, never>;
export function brand<
  Name extends TypeName,
  ParentType extends ConcreteTypeNode,
  Error extends TypeError<NoInfer<Name>>,
>(
  name: Name,
  parent: ValidateBrandParent<Name, ParentType>,
  validate: (value: ParentType["Output"]) => Result<void, Error>,
  // Validation alone determines Error; broad formatters must not widen it.
  formatError: TypeErrorFormatter<NoInfer<Error>>,
): BrandType<ParentType, Name, Error>;
export function brand(
  name: TypeName,
  parent: unknown,
  validate?: (value: unknown) => Result<void, TypeError>,
  formatError?: TypeErrorFormatter<TypeError>,
): TypeNode {
  return createChildType(
    name,
    parent as RuntimeTypeNode,
    validate
      ? (value: unknown) => flatMapResult(validate(value), () => ok(value))
      : ok,
    formatError,
  );
}

export interface BrandType<
  ParentType extends TypeNode,
  Name extends TypeName,
  Error extends TypeError,
> extends Type<
  Name,
  ParentType["Input"],
  ParentType["Output"] & Brand<Name>,
  Error,
  ParentType,
  Error | InferErrors<ParentType>,
  ChildCustomFrom<ParentType, ParentType["Output"] & Brand<Name>, Error>
> {}

/**
 * Canonical ISO date-time {@link String}.
 *
 * Uses the `YYYY-MM-DDTHH:mm:ss.sssZ` format. Date-only strings, timezone
 * offsets, and extended-year forms are rejected.
 */
export const DateIso = /*#__PURE__*/ brand(
  "DateIso",
  String,
  (value) =>
    value.length === 24 && new globalThis.Date(value).toJSON() === value
      ? ok()
      : err<DateIsoError>({ type: "DateIso", value }),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a canonical ISO date-time string.`,
);
export type DateIso = typeof DateIso.Output;

export interface DateIsoError extends TypeError<"DateIso"> {
  readonly value: string;
}

/** Signed 64-bit {@link BigInt}. */
export const Int64 = /*#__PURE__*/ brand(
  "Int64",
  BigInt,
  (value) =>
    globalThis.BigInt.asIntN(64, value) === value
      ? ok()
      : err<Int64Error>({ type: "Int64", value }),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a valid signed 64-bit integer (Int64).`,
);
export type Int64 = typeof Int64.Output;

export interface Int64Error extends TypeError<"Int64"> {
  readonly value: bigint;
}

/** Unsigned 64-bit {@link BigInt}. */
export const UInt64 = /*#__PURE__*/ brand(
  "UInt64",
  BigInt,
  (value) =>
    globalThis.BigInt.asUintN(64, value) === value
      ? ok()
      : err<UInt64Error>({ type: "UInt64", value }),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a valid unsigned 64-bit integer (UInt64).`,
);
export type UInt64 = typeof UInt64.Output;

export interface UInt64Error extends TypeError<"UInt64"> {
  readonly value: bigint;
}

/**
 * Reusable factory for creating a {@link Type} with a {@link Brand}.
 *
 * Use a Brand Factory to define a Brand constraint once and apply it to any
 * parent Type with a compatible Output. The resulting Type preserves the exact
 * parent Type, including its brands and validation errors.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   String,
 *   brand,
 *   err,
 *   ok,
 *   type Brand,
 *   type BrandFactory,
 *   type TypeError,
 * } from "@evolu/common";
 *
 * const trimmed: BrandFactory<"Trimmed", string, TrimmedError> = (
 *   parent,
 * ) =>
 *   brand(
 *     "Trimmed",
 *     parent,
 *     (value) =>
 *       value === value.trim()
 *         ? ok()
 *         : err<TrimmedError>({ type: "Trimmed", value }),
 *     () => "Expected a string without surrounding whitespace.",
 *   );
 *
 * const TrimmedString = trimmed(String);
 * type TrimmedString = typeof TrimmedString.Output;
 *
 * expectTypeOf<TrimmedString>().toEqualTypeOf<string & Brand<"Trimmed">>();
 *
 * interface TrimmedError extends TypeError<"Trimmed"> {
 *   readonly value: string;
 * }
 *
 * expectOk(TrimmedString.fromUnknown("Evolu"), "Evolu");
 * expectErr(TrimmedString.fromUnknown(" Evolu"), {
 *   type: "Trimmed",
 *   value: " Evolu",
 * });
 * ```
 *
 * For numeric parameters encoded in a Brand name, use
 * {@link ValidateBrandFactoryNumber}.
 */
export type BrandFactory<
  Name extends TypeName,
  Value,
  Error extends TypeError<Name>,
> = <ParentType extends ConcreteTypeNode & { readonly Output: Value }>(
  parent: ValidateBrandParent<Name, ParentType>,
) => BrandType<ParentType, Name, Error>;

/**
 * Numeric parameter preserving literal types in a {@link BrandFactory}.
 *
 * Numeric parameters encoded in a {@link Brand} name must preserve their literal
 * types. Inline literals and `const` values do. Arithmetic expressions and
 * runtime numbers widen to `number` and are rejected so distinct constraints do
 * not all share one broad Brand.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   Number,
 *   brand,
 *   err,
 *   ok,
 *   type Brand,
 *   type BrandFactory,
 *   type TypeError,
 *   type ValidateBrandFactoryNumber,
 * } from "@evolu/common";
 *
 * const lessThan =
 *   <Max extends number>(
 *     max: ValidateBrandFactoryNumber<Max>,
 *   ): BrandFactory<`LessThan${Max}`, number, LessThanError<Max>> =>
 *   (parent) => {
 *     const name = `LessThan${max}` as `LessThan${Max}`;
 *
 *     return brand(
 *       name,
 *       parent,
 *       (value) =>
 *         value < max
 *           ? ok()
 *           : err<LessThanError<Max>>({ type: name, value, max }),
 *       () => `Expected a number less than ${max}.`,
 *     );
 *   };
 *
 * const LessThan100 = lessThan(100)(Number);
 * type LessThan100 = typeof LessThan100.Output;
 *
 * expectTypeOf(LessThan100.name).toEqualTypeOf<"LessThan100">();
 * expectTypeOf<LessThan100>().toEqualTypeOf<
 *   number & Brand<"LessThan100">
 * >();
 *
 * interface LessThanError<
 *   Max extends number,
 * > extends TypeError<`LessThan${Max}`> {
 *   readonly value: number;
 *   readonly max: Max;
 * }
 *
 * // @ts-expect-error Arithmetic expressions widen to number.
 * lessThan(100 - 1)(Number);
 * ```
 */
export type ValidateBrandFactoryNumber<Value extends number> =
  IsUnion<Value> extends false
    ? number extends Value
      ? Value & Readonly<Record<BrandFactoryNumberError, never>>
      : Value
    : Value & Readonly<Record<BrandFactoryNumberError, never>>;

type BrandFactoryNumberError = CompileTimeError<
  "Brand Factory",
  "Parameter must preserve one concrete numeric literal type instead of widening to number or using a union."
>;

/**
 * Capitalized {@link Brand}.
 *
 * Requires the first character of a string to be uppercase.
 *
 * ### Example
 *
 * ```ts
 * import { String, capitalized, type Brand } from "@evolu/common";
 *
 * const CapitalizedString = capitalized(String);
 * type CapitalizedString = typeof CapitalizedString.Output;
 *
 * expectTypeOf<CapitalizedString>().toEqualTypeOf<
 *   string & Brand<"Capitalized">
 * >();
 *
 * expectOk(CapitalizedString.fromUnknown("Evolu"), "Evolu");
 * expectErr(CapitalizedString.fromUnknown("evolu"), {
 *   type: "Capitalized",
 *   value: "evolu",
 * });
 * ```
 */
export const capitalized: BrandFactory<
  "Capitalized",
  string,
  CapitalizedError
> = (parent) =>
  brand(
    "Capitalized",
    parent,
    (value) => {
      const [first = ""] = value;

      return value === first.toUpperCase() + value.slice(first.length)
        ? ok()
        : err<CapitalizedError>({ type: "Capitalized", value });
    },
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be capitalized.`,
  );

export interface CapitalizedError extends TypeError<"Capitalized"> {
  readonly value: string;
}

/** Capitalized {@link String}. */
export const CapitalizedString = /*#__PURE__*/ capitalized(String);
export type CapitalizedString = typeof CapitalizedString.Output;

/** Adds a {@link Brand} requiring a string without surrounding whitespace. */
export const trimmed: BrandFactory<"Trimmed", string, TrimmedError> = (
  parent,
) =>
  brand(
    "Trimmed",
    parent,
    (value) =>
      value === value.trim()
        ? ok()
        : err<TrimmedError>({ type: "Trimmed", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be trimmed.`,
  );

export interface TrimmedError extends TypeError<"Trimmed"> {
  readonly value: string;
}

/**
 * A {@link String} without surrounding whitespace.
 *
 * This Type validates that a string is already trimmed; it does not modify the
 * value. Use {@link trim} to normalize a string. Because an empty string is
 * valid, this Type is useful as an intermediate boundary for input controls
 * that trim their values before domain validation. If an empty string is
 * invalid, use {@link NonEmptyTrimmedString}.
 */
export const TrimmedString = /*#__PURE__*/ trimmed(String);
export type TrimmedString = typeof TrimmedString.Output;

/** Trims a string and returns a {@link TrimmedString}. */
export const trim = (value: string): TrimmedString =>
  value.trim() as TrimmedString;

/** Adds a {@link Brand} requiring a value to have at least `min` items. */
export const minLength =
  <Min extends number>(
    min: ValidateBrandFactoryNumber<Min>,
  ): BrandFactory<`MinLength${Min}`, ValueWithLength, MinLengthError<Min>> =>
  (parent) => {
    const name = `MinLength${min}` as `MinLength${Min}`;

    return brand(
      name,
      parent,
      (value) =>
        value.length >= min
          ? ok()
          : err<MinLengthError<Min>>({ type: name, value, min }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} does not meet the minimum length of ${error.min}.`,
    );
  };

export interface MinLengthError<
  Min extends number = number,
> extends TypeError<`MinLength${Min}`> {
  readonly value: ValueWithLength;
  readonly min: Min;
}

/**
 * A non-empty {@link TrimmedString}.
 *
 * Use as the base Type for ordinary human-entered text, which should usually be
 * trimmed, non-empty, and bounded. Add a domain-appropriate maximum with
 * {@link maxLength}, or use {@link NonEmptyTrimmedString100} or
 * {@link NonEmptyTrimmedString1000}.
 *
 * Exceptional domains should deliberately start from {@link String} or
 * {@link TrimmedString} and add constraints such as {@link minLength} according
 * to whether empty values and surrounding whitespace are meaningful.
 */
export const NonEmptyTrimmedString = /*#__PURE__*/ minLength(1)(TrimmedString);
export type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Output;

/** Adds a {@link Brand} requiring a value to have at most `max` items. */
export const maxLength =
  <Max extends number>(
    max: ValidateBrandFactoryNumber<Max>,
  ): BrandFactory<`MaxLength${Max}`, ValueWithLength, MaxLengthError<Max>> =>
  (parent) => {
    const name = `MaxLength${max}` as `MaxLength${Max}`;

    return brand(
      name,
      parent,
      (value) =>
        value.length <= max
          ? ok()
          : err<MaxLengthError<Max>>({ type: name, value, max }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} exceeds the maximum length of ${error.max}.`,
    );
  };

export interface MaxLengthError<
  Max extends number = number,
> extends TypeError<`MaxLength${Max}`> {
  readonly value: ValueWithLength;
  readonly max: Max;
}

/** A {@link NonEmptyTrimmedString} with at most 100 UTF-16 code units. */
export const NonEmptyTrimmedString100 = /*#__PURE__*/ maxLength(100)(
  NonEmptyTrimmedString,
);
export type NonEmptyTrimmedString100 = typeof NonEmptyTrimmedString100.Output;

/** A {@link NonEmptyTrimmedString} with at most 1,000 UTF-16 code units. */
export const NonEmptyTrimmedString1000 = /*#__PURE__*/ maxLength(1000)(
  NonEmptyTrimmedString,
);
export type NonEmptyTrimmedString1000 = typeof NonEmptyTrimmedString1000.Output;

/** Adds a {@link Brand} requiring a value to have exactly `exact` items. */
export const length =
  <Exact extends number>(
    exact: ValidateBrandFactoryNumber<Exact>,
  ): BrandFactory<`Length${Exact}`, ValueWithLength, LengthError<Exact>> =>
  (parent) => {
    const name = `Length${exact}` as `Length${Exact}`;

    return brand(
      name,
      parent,
      (value) =>
        value.length === exact
          ? ok()
          : err<LengthError<Exact>>({ type: name, value, exact }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} does not have the required length of ${error.exact}.`,
    );
  };

export interface LengthError<
  Exact extends number = number,
> extends TypeError<`Length${Exact}`> {
  readonly value: ValueWithLength;
  readonly exact: Exact;
}

/**
 * Creates a string {@link Brand} that must match a regular expression.
 *
 * ### Example
 *
 * A non-empty string using the URL-safe alphabet:
 *
 * ```ts
 * import { String, regex, type Brand } from "@evolu/common";
 *
 * const UrlSafeString = regex("UrlSafeString", /^[A-Za-z0-9_-]+$/)(String);
 * type UrlSafeString = typeof UrlSafeString.Output;
 *
 * expectTypeOf<UrlSafeString>().toEqualTypeOf<
 *   string & Brand<"UrlSafeString">
 * >();
 *
 * expectOk(UrlSafeString.fromUnknown("abc-123_DEF"), "abc-123_DEF");
 * expectErr(UrlSafeString.fromUnknown("not safe"), {
 *   type: "UrlSafeString",
 *   value: "not safe",
 *   source: "^[A-Za-z0-9_-]+$",
 *   flags: "",
 * });
 * ```
 */
export const regex = <const Name extends TypeName>(
  name: ValidateConcreteTypeName<Name>,
  pattern: RegExp,
): BrandFactory<Name, string, RegexError<Name>> => {
  const concreteName = name as Name;
  const source = pattern.source;
  const flags = pattern.flags;
  const matcher = new RegExp(source, flags);

  return (parent) =>
    brand(
      concreteName,
      parent,
      (value) => {
        matcher.lastIndex = 0;

        return matcher.test(value)
          ? ok()
          : err<RegexError<typeof concreteName>>({
              type: concreteName,
              value,
              source,
              flags,
            });
      },
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} does not match /${error.source}/${error.flags}.`,
    );
};

export interface RegexError<
  Name extends TypeName = TypeName,
> extends TypeError<Name> {
  readonly value: string;
  readonly source: string;
  readonly flags: string;
}

/** Non-empty URL-safe {@link String}. */
export const UrlSafeString = /*#__PURE__*/ regex(
  "UrlSafeString",
  /^[A-Za-z0-9_-]+$/,
)(String);
export type UrlSafeString = typeof UrlSafeString.Output;

/** Adds a {@link Brand} requiring a number greater than or equal to zero. */
export const nonNegative: BrandFactory<
  "NonNegative",
  number,
  NonNegativeError
> = (parent) =>
  brand(
    "NonNegative",
    parent,
    (value) =>
      value >= 0 ? ok() : err<NonNegativeError>({ type: "NonNegative", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be non-negative (>= 0).`,
  );

export interface NonNegativeError extends TypeError<"NonNegative"> {
  readonly value: number;
}

/** Non-negative {@link Number}. */
export const NonNegativeNumber = /*#__PURE__*/ nonNegative(Number);
export type NonNegativeNumber = typeof NonNegativeNumber.Output;

/** Adds a {@link Brand} requiring a number greater than zero. */
export const positive: BrandFactory<"Positive", number, PositiveError> = (
  parent,
) =>
  brand(
    "Positive",
    parent,
    (value) =>
      value > 0 ? ok() : err<PositiveError>({ type: "Positive", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be positive (> 0).`,
  );

export interface PositiveError extends TypeError<"Positive"> {
  readonly value: number;
}

/**
 * Positive {@link Number}.
 *
 * Also satisfies {@link NonNegativeNumber}, so it can be used wherever a
 * non-negative number is required.
 */
export const PositiveNumber = /*#__PURE__*/ positive(NonNegativeNumber);
export type PositiveNumber = typeof PositiveNumber.Output;

/** Adds a {@link Brand} requiring a number less than or equal to zero. */
export const nonPositive: BrandFactory<
  "NonPositive",
  number,
  NonPositiveError
> = (parent) =>
  brand(
    "NonPositive",
    parent,
    (value) =>
      value <= 0 ? ok() : err<NonPositiveError>({ type: "NonPositive", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be non-positive (<= 0).`,
  );

export interface NonPositiveError extends TypeError<"NonPositive"> {
  readonly value: number;
}

/** Non-positive {@link Number}. */
export const NonPositiveNumber = /*#__PURE__*/ nonPositive(Number);
export type NonPositiveNumber = typeof NonPositiveNumber.Output;

/** Adds a {@link Brand} requiring a number less than zero. */
export const negative: BrandFactory<"Negative", number, NegativeError> = (
  parent,
) =>
  brand(
    "Negative",
    parent,
    (value) =>
      value < 0 ? ok() : err<NegativeError>({ type: "Negative", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be negative (< 0).`,
  );

export interface NegativeError extends TypeError<"Negative"> {
  readonly value: number;
}

/**
 * Negative {@link Number}.
 *
 * Also satisfies {@link NonPositiveNumber}, so it can be used wherever a
 * non-positive number is required.
 */
export const NegativeNumber = /*#__PURE__*/ negative(NonPositiveNumber);
export type NegativeNumber = typeof NegativeNumber.Output;

/**
 * Safe integer {@link Brand}.
 *
 * Requires a {@link Number} to be an integer within JavaScript's safe integer
 * range.
 *
 * ### Example
 *
 * ```ts
 * import { Number, int, type Brand } from "@evolu/common";
 *
 * const Int = int(Number);
 * type Int = typeof Int.Output;
 *
 * expectTypeOf<Int>().toEqualTypeOf<number & Brand<"Int">>();
 *
 * expectOk(Int.fromUnknown(42), 42);
 * expectErr(Int.fromUnknown(1.5), { type: "Int", value: 1.5 });
 * ```
 */
export const int: BrandFactory<"Int", number, IntError> = (parent) =>
  brand(
    "Int",
    parent,
    (value) =>
      globalThis.Number.isSafeInteger(value)
        ? ok()
        : err<IntError>({ type: "Int", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be a safe integer.`,
  );

export interface IntError extends TypeError<"Int"> {
  readonly value: number;
}

/** Safe integer {@link Number}. */
export const Int = /*#__PURE__*/ int(Number);
export type Int = typeof Int.Output;

/** Non-negative {@link Int}. */
export const NonNegativeInt = /*#__PURE__*/ nonNegative(Int);
export type NonNegativeInt = typeof NonNegativeInt.Output;

/** 0-100 as a literal, or any already-validated {@link NonNegativeInt}. */
export type Int0To100OrNonNegativeInt = 0 | Int1To100 | NonNegativeInt;

/** Minimum {@link NonNegativeInt} value. */
export const zeroNonNegativeInt = /*#__PURE__*/ NonNegativeInt.orThrow(0);

/**
 * Positive {@link Int}.
 *
 * Also satisfies {@link NonNegativeInt}, so it can be used wherever a
 * non-negative integer is required.
 */
export const PositiveInt = /*#__PURE__*/ positive(NonNegativeInt);
export type PositiveInt = typeof PositiveInt.Output;

/** 1-100 as a literal, or any already-validated {@link PositiveInt}. */
export type Int1To100OrPositiveInt = Int1To100 | PositiveInt;

/** Minimum {@link PositiveInt} value. */
export const onePositiveInt = /*#__PURE__*/ PositiveInt.orThrow(1);

/** Maximum {@link PositiveInt} value. */
export const maxPositiveInt =
  /*#__PURE__*/ PositiveInt.orThrow(9_007_199_254_740_991);

/** Non-positive {@link Int}. */
export const NonPositiveInt = /*#__PURE__*/ nonPositive(Int);
export type NonPositiveInt = typeof NonPositiveInt.Output;

/**
 * Negative {@link Int}.
 *
 * Also satisfies {@link NonPositiveInt}, so it can be used wherever a
 * non-positive integer is required.
 */
export const NegativeInt = /*#__PURE__*/ negative(NonPositiveInt);
export type NegativeInt = typeof NegativeInt.Output;

/** Adds a {@link Brand} requiring a number greater than `min`. */
export const greaterThan =
  <Min extends number>(
    min: ValidateBrandFactoryNumber<Min>,
  ): BrandFactory<`GreaterThan${Min}`, number, GreaterThanError<Min>> =>
  (parent) => {
    const name = `GreaterThan${min}` as `GreaterThan${Min}`;

    return brand(
      name,
      parent,
      (value) =>
        value > min
          ? ok()
          : err<GreaterThanError<Min>>({ type: name, value, min }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} must be greater than ${error.min}.`,
    );
  };

export interface GreaterThanError<
  Min extends number = number,
> extends TypeError<`GreaterThan${Min}`> {
  readonly value: number;
  readonly min: Min;
}

/** Adds a {@link Brand} requiring a number greater than or equal to `min`. */
export const greaterThanOrEqualTo =
  <Min extends number>(
    min: ValidateBrandFactoryNumber<Min>,
  ): BrandFactory<
    `GreaterThanOrEqualTo${Min}`,
    number,
    GreaterThanOrEqualToError<Min>
  > =>
  (parent) => {
    const name = `GreaterThanOrEqualTo${min}` as `GreaterThanOrEqualTo${Min}`;

    return brand(
      name,
      parent,
      (value) =>
        value >= min
          ? ok()
          : err<GreaterThanOrEqualToError<Min>>({
              type: name,
              value,
              min,
            }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} must be greater than or equal to ${error.min}.`,
    );
  };

export interface GreaterThanOrEqualToError<
  Min extends number = number,
> extends TypeError<`GreaterThanOrEqualTo${Min}`> {
  readonly value: number;
  readonly min: Min;
}

/** Adds a {@link Brand} requiring a number less than `max`. */
export const lessThan =
  <Max extends number>(
    max: ValidateBrandFactoryNumber<Max>,
  ): BrandFactory<`LessThan${Max}`, number, LessThanError<Max>> =>
  (parent) => {
    const name = `LessThan${max}` as `LessThan${Max}`;

    return brand(
      name,
      parent,
      (value) =>
        value < max
          ? ok()
          : err<LessThanError<Max>>({ type: name, value, max }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} must be less than ${error.max}.`,
    );
  };

export interface LessThanError<
  Max extends number = number,
> extends TypeError<`LessThan${Max}`> {
  readonly value: number;
  readonly max: Max;
}

/** Adds a {@link Brand} requiring a number less than or equal to `max`. */
export const lessThanOrEqualTo =
  <Max extends number>(
    max: ValidateBrandFactoryNumber<Max>,
  ): BrandFactory<
    `LessThanOrEqualTo${Max}`,
    number,
    LessThanOrEqualToError<Max>
  > =>
  (parent) => {
    const name = `LessThanOrEqualTo${max}` as `LessThanOrEqualTo${Max}`;

    return brand(
      name,
      parent,
      (value) =>
        value <= max
          ? ok()
          : err<LessThanOrEqualToError<Max>>({ type: name, value, max }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} must be less than or equal to ${error.max}.`,
    );
  };

export interface LessThanOrEqualToError<
  Max extends number = number,
> extends TypeError<`LessThanOrEqualTo${Max}`> {
  readonly value: number;
  readonly max: Max;
}

/** Adds a {@link Brand} requiring a number other than `NaN`. */
export const nonNaN: BrandFactory<"NonNaN", number, NonNaNError> = (parent) =>
  brand(
    "NonNaN",
    parent,
    (value) =>
      globalThis.Number.isNaN(value)
        ? err<NonNaNError>({ type: "NonNaN", value })
        : ok(),
    () => "The value must not be NaN.",
  );

export interface NonNaNError extends TypeError<"NonNaN"> {
  readonly value: number;
}

/** {@link Number} other than `NaN`; infinities are allowed. */
export const NonNaNNumber = /*#__PURE__*/ nonNaN(Number);
export type NonNaNNumber = typeof NonNaNNumber.Output;

/** Adds a {@link Brand} requiring a finite number. */
export const finite: BrandFactory<"Finite", number, FiniteError> = (parent) =>
  brand(
    "Finite",
    parent,
    (value) =>
      globalThis.Number.isFinite(value)
        ? ok()
        : err<FiniteError>({ type: "Finite", value }),
    (error) =>
      `The value ${safelyStringifyUnknownValue(error.value)} must be finite.`,
  );

export interface FiniteError extends TypeError<"Finite"> {
  readonly value: number;
}

/** Finite {@link Number}. */
export const FiniteNumber = /*#__PURE__*/ finite(NonNaNNumber);
export type FiniteNumber = typeof FiniteNumber.Output;

/** Non-negative {@link FiniteNumber}. */
export const NonNegativeFiniteNumber = /*#__PURE__*/ nonNegative(FiniteNumber);
export type NonNegativeFiniteNumber = typeof NonNegativeFiniteNumber.Output;

/** Finite {@link Number} from zero to one, inclusive. */
export const Ratio = /*#__PURE__*/ brand(
  "Ratio",
  /*#__PURE__*/ lessThanOrEqualTo(1)(NonNegativeFiniteNumber),
);
export type Ratio = typeof Ratio.Output;

/**
 * Canonical string representation of a positive base-10 decimal.
 *
 * Each value has one spelling: leading zeroes, trailing fractional zeroes,
 * signs, and exponent notation are rejected. This preserves exact decimal
 * meaning without representing the value as an IEEE-754 number.
 *
 * ### Example
 *
 * ```ts
 * import { PositiveDecimalString } from "@evolu/common";
 *
 * expectOk(PositiveDecimalString.fromUnknown("0.3"), "0.3");
 * expectOk(PositiveDecimalString.fromUnknown("25"), "25");
 *
 * expectErr(PositiveDecimalString.fromUnknown("0.30"), {
 *   type: "PositiveDecimalString",
 *   value: "0.30",
 * });
 * ```
 */
export const PositiveDecimalString = /*#__PURE__*/ brand(
  "PositiveDecimalString",
  String,
  (value) =>
    /^(?:[1-9]\d*|(?:0|[1-9]\d*)\.\d*[1-9])$/.test(value)
      ? ok()
      : err<PositiveDecimalStringError>({
          type: "PositiveDecimalString",
          value,
        }),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} must be a canonical positive decimal string.`,
);
export type PositiveDecimalString = typeof PositiveDecimalString.Output;

export interface PositiveDecimalStringError extends TypeError<"PositiveDecimalString"> {
  readonly value: string;
}

type ValidateMultipleOfDivisor<Divisor extends string> =
  IsUnion<Divisor> extends false
    ? string extends Divisor
      ? InvalidMultipleOfDivisor<Divisor>
      : IsCanonicalPositiveDecimalString<Divisor> extends true
        ? Divisor
        : InvalidMultipleOfDivisor<Divisor>
    : InvalidMultipleOfDivisor<Divisor>;

type IsCanonicalPositiveDecimalString<Value extends string> =
  Value extends `${infer Integer}.${infer Fraction}`
    ? IsCanonicalNonNegativeIntegerString<Integer> extends true
      ? IsCanonicalPositiveFractionString<Fraction>
      : false
    : IsCanonicalPositiveIntegerString<Value>;

type IsCanonicalNonNegativeIntegerString<Value extends string> =
  Value extends "0" ? true : IsCanonicalPositiveIntegerString<Value>;

type IsCanonicalPositiveIntegerString<Value extends string> =
  Value extends `${Digit1To9}${infer Rest}` ? IsDecimalDigits<Rest> : false;

type IsCanonicalPositiveFractionString<Value extends string> =
  Value extends `${infer Rest}${Digit1To9}` ? IsDecimalDigits<Rest> : false;

type IsDecimalDigits<Value extends string> = Value extends ""
  ? true
  : Value extends `${Digit}${infer Rest}`
    ? IsDecimalDigits<Rest>
    : false;

type InvalidMultipleOfDivisor<Divisor extends string> = Divisor &
  Readonly<Record<MultipleOfDivisorError, never>>;

type MultipleOfDivisorError = CompileTimeError<
  "MultipleOf",
  'Divisor must be one canonical positive decimal string literal such as "0.1".'
>;

/**
 * Adds a {@link Brand} requiring a number to be a multiple of an exact decimal
 * `divisor`.
 *
 * The literal divisor is validated against {@link PositiveDecimalString} and
 * encoded in the resulting Brand name. A runtime string cannot define this Type
 * because its exact value is not available to TypeScript for that name.
 * Validation does not round: `"0.1"` accepts `0.3`, but rejects `0.1 + 0.2`
 * because that expression evaluates to `0.30000000000000004`.
 *
 * ### Example
 *
 * ```ts
 * import { FiniteNumber, multipleOf } from "@evolu/common";
 *
 * const Tenths = multipleOf("0.1")(FiniteNumber);
 *
 * expectOk(Tenths.fromUnknown(0.3), 0.3);
 * expectErr(Tenths.fromUnknown(0.31), {
 *   type: "MultipleOf0.1",
 *   value: 0.31,
 *   divisor: "0.1",
 * });
 * ```
 */
export const multipleOf = <const Divisor extends string>(
  divisor: ValidateMultipleOfDivisor<Divisor>,
): BrandFactory<`MultipleOf${Divisor}`, number, MultipleOfError<Divisor>> => {
  assertType(PositiveDecimalString, divisor);

  const name = `MultipleOf${divisor}` as `MultipleOf${Divisor}`;
  const decimalDivisor = decimalStringToParts(divisor);

  return (parent) =>
    brand(
      name,
      parent,
      (value) => {
        let isMultiple = false;

        if (globalThis.Number.isFinite(value)) {
          const decimalValue = decimalStringToParts(value.toString());
          const exponentDifference =
            decimalValue.exponent - decimalDivisor.exponent;

          if (exponentDifference >= 0) {
            isMultiple =
              (decimalValue.coefficient *
                10n ** globalThis.BigInt(exponentDifference)) %
                decimalDivisor.coefficient ===
              0n;
          } else {
            isMultiple =
              decimalValue.coefficient %
                (decimalDivisor.coefficient *
                  10n ** globalThis.BigInt(-exponentDifference)) ===
              0n;
          }
        }

        return isMultiple
          ? ok()
          : err<MultipleOfError<Divisor>>({
              type: name,
              value,
              divisor,
            });
      },
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} must be a multiple of ${error.divisor}.`,
    );
};

export interface MultipleOfError<
  Divisor extends string = string,
> extends TypeError<`MultipleOf${Divisor}`> {
  readonly value: number;
  readonly divisor: Divisor;
}

interface DecimalParts {
  readonly coefficient: bigint;
  readonly exponent: number;
}

const decimalStringToParts = (value: string): DecimalParts => {
  const exponentIndex = value.indexOf("e");
  const significand =
    exponentIndex === -1 ? value : value.slice(0, exponentIndex);
  const scientificExponent =
    exponentIndex === -1
      ? 0
      : globalThis.Number.parseInt(value.slice(exponentIndex + 1), 10);
  const decimalPointIndex = significand.indexOf(".");
  const fractionLength =
    decimalPointIndex === -1 ? 0 : significand.length - decimalPointIndex - 1;
  let coefficient = globalThis.BigInt(significand.replace(".", ""));
  let exponent = scientificExponent - fractionLength;

  if (coefficient === 0n) return { coefficient, exponent: 0 };

  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent++;
  }

  return { coefficient, exponent };
};

/** Adds a {@link Brand} requiring a number to be within an inclusive range. */
export const between =
  <Min extends number, Max extends number>(
    min: ValidateBrandFactoryNumber<Min>,
    max: ValidateBrandFactoryNumber<Max>,
  ): BrandFactory<`Between${Min}-${Max}`, number, BetweenError<Min, Max>> =>
  (parent) => {
    const name = `Between${min}-${max}` as `Between${Min}-${Max}`;

    return brand(
      name,
      parent,
      (value) =>
        value >= min && value <= max
          ? ok()
          : err<BetweenError<Min, Max>>({
              type: name,
              value,
              min,
              max,
            }),
      (error) =>
        `The value ${safelyStringifyUnknownValue(error.value)} must be between ${error.min} and ${error.max}, inclusive.`,
    );
  };

export interface BetweenError<
  Min extends number = number,
  Max extends number = number,
> extends TypeError<`Between${Min}-${Max}`> {
  readonly value: number;
  readonly min: Min;
  readonly max: Max;
}

/**
 * Array {@link Type}.
 *
 * Use `array(Element)` for readonly arrays in which every element must match
 * the same Type, such as arrays of IDs or labels.
 *
 * `fromUnknown` validates the array and every element. By default, it returns
 * the first issue. Pass `{ errors: "all" }` to collect issues across the whole
 * array. Element errors identify the failing index.
 *
 * `from` accepts an array of element Outputs. `from.parent` accepts an array of
 * values typed as the element's parent Output. Each operation asserts its
 * selected array and element boundary, then returns errors only from the
 * remaining element stages. Additional suffixes move that boundary toward the
 * element's root Type.
 *
 * An Array must use this realm's `Array.prototype`, be dense, and have no own
 * properties other than `length` and the indexed data properties from `0`
 * through `length - 1`. Array subclasses, custom-prototype arrays,
 * foreign-realm arrays, sparse arrays, accessor elements, and excess properties
 * are rejected.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   String,
 *   array,
 *   brand,
 *   type Brand,
 *   type Result,
 * } from "@evolu/common";
 *
 * const UserId = brand("UserId", String);
 * const UserIds = array(UserId);
 * const result = UserIds.from.parent(["ada", "grace"]);
 *
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<ReadonlyArray<string & Brand<"UserId">>, never>
 * >();
 * expectOk(result, ["ada", "grace"]);
 * expectOk(UserIds.fromUnknown(["ada", "grace"]), ["ada", "grace"]);
 * expectErr(UserIds.fromUnknown("ada"), {
 *   type: "Array",
 *   reason: { kind: "NotArray", value: "ada" },
 * });
 * ```
 */
export const array = <ElementType extends ConcreteTypeNode>(
  element: ValidateElement<ElementType>,
): ArrayType<ElementType> => {
  const typeElement = element as unknown as ElementType & RuntimeTypeNode;
  const cached = arrayTypeByElement.get(typeElement);

  if (cached) return cached as ArrayType<ElementType>;

  const validate = (
    value: unknown,
    validateElement: RuntimeOutputValidation,
    options: ValidationOptions,
  ): Result<ReadonlyArray<unknown>, ArrayError> => {
    if (!Array.isArray(value)) {
      return err({
        type: "Array",
        reason: { kind: "NotArray", value },
      });
    }
    if (!hasCurrentRealmArrayPrototype(value)) {
      return err({
        type: "Array",
        reason: { kind: "UnexpectedPrototype", value },
      });
    }

    return validateArrayItems(value, validateElement, options, true);
  };
  const fromUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => validate(value, typeElement.fromUnknown, options);
  const validateOutput = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => validate(value, typeElement[outputValidationSymbol], options);
  const formatError: TypeErrorFormatter<ArrayError> = (error) => {
    if (error.reason.kind === "NotArray") {
      return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not an array.`;
    }
    if (error.reason.kind !== "Items") {
      return `The value is an array, but an Array Output must use this realm's Array.prototype. ${boundaryRepresentationGuidance}`;
    }

    const issue = error.reason.issues[0] as ArrayStructuralIssue;

    switch (issue.kind) {
      case "Hole":
        return `An array element at index ${issue.index} is missing.`;
      case "Accessor":
        return `An array element at index ${issue.index} must be a data property.`;
      case "ExcessProperty":
        return "An excess Array property is not allowed. Remove it or use a different Type.";
    }
  };
  const parent = typeElement.parent
    ? (array as unknown as (element: ConcreteTypeNode) => TypeNode)(
        typeElement.parent as ConcreteTypeNode,
      )
    : null;

  const encodeElement = typeElement[encoderSymbol];
  const canSkipTo = encodeElement === identity;

  const fromParent = typeElement[fromSymbol].parent
    ? mapRuntimeOperations(
        typeElement[fromSymbol].parent,
        (operation) =>
          (
            value: ReadonlyArray<unknown>,
            options: ValidationOptions = firstValidationOptions,
          ) =>
            validateArrayItems(
              value,
              operation as (
                value: unknown,
                options: ValidationOptions,
              ) => Result<unknown, TypeError>,
              options,
              false,
            ),
      )
    : undefined;
  const from = createFromOperation(fromParent);
  const to: RuntimeEncoder = canSkipTo
    ? identity
    : (value: ReadonlyArray<unknown>) => {
        let output: Array<unknown> | undefined;

        for (let index = 0; index < value.length; index++) {
          const item = value[index];
          const encoded = encodeElement(item as never);

          if (!globalThis.Object.is(encoded, item)) {
            output ??= copyArrayPrefix(value, index);
          }
          if (output) output[index] = encoded;
        }

        return output ?? value;
      };

  const is = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (!hasCurrentRealmArrayPrototype(value)) return false;
    if (Reflect.ownKeys(value).length !== value.length + 1) return false;

    for (let index = 0; index < value.length; index++) {
      const descriptor = globalThis.Object.getOwnPropertyDescriptor(
        value,
        index,
      );
      if (descriptor === undefined || !("value" in descriptor)) return false;
      if (!typeElement.is(descriptor.value)) return false;
    }

    return true;
  };
  const getTypeIssues = createCollectionRuntimeTypeIssues(
    "Array",
    "Items",
    formatError as TypeErrorFormatter<TypeError>,
    () => typeElement,
  );

  const type = createTypeNode<ArrayType<ElementType>>(
    "Array",
    parent,
    fromUnknown,
    is,
    validateOutput,
    from,
    to,
    getTypeIssues,
    { element: typeElement },
  );

  arrayTypeByElement.set(typeElement, type);

  return type;
};

export interface ArrayType<ElementType extends TypeNode> extends Type<
  "Array",
  ReadonlyArray<ElementType["Input"]>,
  ReadonlyArray<ElementType["Output"]>,
  ArrayNodeError<ElementType>,
  ArrayParent<ElementType>,
  ArrayError<InferErrors<ElementType>>,
  ArrayCustomFrom<ElementType>
> {
  readonly element: ElementType;
}

type ArrayCustomFrom<ElementType extends TypeNode> = [
  ElementType["parent"],
] extends [TypeNode]
  ? ArrayFromOperation<ElementType>
  : never;

type ArrayFromOperation<ElementType extends TypeNode> = [
  ElementType["parent"],
] extends [infer Parent extends TypeNode]
  ? TypeOperationFn<
      "from",
      ReadonlyArray<ElementType["Output"]>,
      ReadonlyArray<ElementType["Output"]>,
      never
    > &
      ArrayFromParentOperations<
        ElementType["Output"],
        ElementType["Error"],
        Parent
      >
  : TypeOperationFn<
      "from",
      ReadonlyArray<ElementType["Output"]>,
      ReadonlyArray<ElementType["Output"]>,
      never
    >;

interface ArrayFromParentOperations<
  Output,
  Error extends TypeError,
  Boundary extends TypeNode,
> {
  readonly parent: TypeOperationFn<
    "from",
    ReadonlyArray<Boundary["Output"]>,
    ReadonlyArray<Output>,
    ArrayElementsError<Error>
  > &
    ([Boundary["parent"]] extends [infer Parent extends TypeNode]
      ? ArrayFromParentOperations<Output, Error | Boundary["Error"], Parent>
      : unknown);
}

type ValidateElement<T extends ConcreteTypeNode> =
  IsUnion<T> extends false
    ? T
    : CompileTimeError<
        "Type",
        "Element must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
      >;

type ArrayParent<ElementType extends TypeNode> = [
  ElementType["parent"],
] extends [infer ParentElement extends TypeNode]
  ? ArrayType<ParentElement>
  : null;

type ArrayNodeError<ElementType extends TypeNode> = [
  ElementType["parent"],
] extends [TypeNode]
  ? ArrayElementsError<ElementType["Error"]>
  : ArrayError<ElementType["Error"]>;

export type ArrayError<Error extends TypeError = TypeError> =
  | ArrayNotArrayError
  | ArrayUnexpectedPrototypeError
  | ArrayItemsErrorValue<Error, true>;

export interface ArrayNotArrayError extends TypeError<"Array"> {
  readonly reason: {
    readonly kind: "NotArray";
    readonly value: unknown;
  };
}

/** An error returned when an {@link array} input has an unexpected prototype. */
export interface ArrayUnexpectedPrototypeError extends TypeError<"Array"> {
  readonly reason: {
    readonly kind: "UnexpectedPrototype";
    readonly value: ReadonlyArray<unknown>;
  };
}

export type ArrayItemsError<Error extends TypeError> = ArrayItemsErrorValue<
  Error,
  true
>;

export type ArrayIssue<Error extends TypeError> =
  ArrayStructuralIssue | ArrayElementIssue<Error>;

export interface ArrayHoleIssue {
  readonly kind: "Hole";
  readonly index: number;
}

export interface ArrayAccessorIssue {
  readonly kind: "Accessor";
  readonly index: number;
}

export interface ArrayExcessPropertyIssue {
  readonly kind: "ExcessProperty";
  readonly key: string | symbol;
}

type ArrayStructuralIssue =
  ArrayHoleIssue | ArrayAccessorIssue | ArrayExcessPropertyIssue;

export type ArrayElementIssue<Error extends TypeError> = Error extends TypeError
  ? {
      readonly kind: "Element";
      readonly index: number;
      readonly error: Error;
    }
  : never;

export type ArrayElementsError<Error extends TypeError> = [Error] extends [
  never,
]
  ? never
  : ArrayItemsErrorValue<Error, false>;

interface ArrayItemsErrorValue<
  Error extends TypeError,
  IncludeStructuralIssues extends boolean,
> extends TypeError<"Array"> {
  readonly reason: {
    readonly kind: "Items";
    readonly issues: NonEmptyReadonlyArray<
      | (true extends IncludeStructuralIssues ? ArrayStructuralIssue : never)
      | ArrayElementIssue<Error>
    >;
  };
}

const validateArrayItems = (
  value: ReadonlyArray<unknown>,
  validate: (
    value: unknown,
    options: ValidationOptions,
  ) => Result<unknown, TypeError>,
  options: ValidationOptions,
  checkStructure: boolean,
): Result<ReadonlyArray<unknown>, ArrayItemsError<TypeError>> => {
  let issues: Array<ArrayIssue<TypeError>> | undefined;
  let output: Array<unknown> | undefined;

  if (checkStructure) {
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key === "string") {
        const index = globalThis.Number(key) >>> 0;
        if (index < value.length && globalThis.String(index) === key) {
          continue;
        }
      }

      (issues ??= []).push({ kind: "ExcessProperty", key });
      if (options.errors === "first") break;
    }
  }

  for (
    let index = 0;
    (issues === undefined || options.errors === "all") && index < value.length;
    index++
  ) {
    let item: unknown;

    if (checkStructure) {
      const descriptor = globalThis.Object.getOwnPropertyDescriptor(
        value,
        index,
      );

      if (descriptor === undefined) {
        (issues ??= []).push({ kind: "Hole", index });

        if (options.errors === "first") break;
        continue;
      }
      if (!("value" in descriptor)) {
        (issues ??= []).push({ kind: "Accessor", index });

        if (options.errors === "first") break;
        continue;
      }
      item = descriptor.value;
    } else {
      item = value[index];
    }
    const result = validate(item, options);

    if (result.ok) {
      if (issues !== undefined) continue;

      if (!globalThis.Object.is(result.value, item)) {
        output ??= copyArrayPrefix(value, index);
      }
      if (output) output[index] = result.value;
      continue;
    }

    (issues ??= []).push({ kind: "Element", index, error: result.error });

    if (options.errors === "first") break;
  }

  return issues == null
    ? ok(output ?? value)
    : err({
        type: "Array",
        reason: {
          kind: "Items",
          issues: issues as unknown as NonEmptyReadonlyArray<
            ArrayIssue<TypeError>
          >,
        },
      });
};

const copyArrayPrefix = (
  value: ReadonlyArray<unknown>,
  endIndex: number,
): Array<unknown> => {
  const output = new Array<unknown>(value.length);

  for (let index = 0; index < endIndex; index++) {
    output[index] = value[index];
  }

  return output;
};

const arrayTypeByElement = /*#__PURE__*/ new WeakMap<TypeNode, unknown>();

const boundaryRepresentationGuidance =
  "For a trusted return contract, cast and skip this Type; otherwise, use boundary-specific validation or transformation.";

const hasCurrentRealmArrayPrototype = (
  value: ReadonlyArray<unknown>,
): boolean =>
  globalThis.Object.getPrototypeOf(value) === globalThis.Array.prototype;

/**
 * Tuple {@link Type}.
 *
 * Use `tuple(First, Second, ...)` for a fixed-length readonly array in which
 * every position has its own Type.
 *
 * `fromUnknown` validates the Tuple representation and runs every element's
 * complete Type pipeline. By default, it returns the first issue. Pass `{
 * errors: "all" }` to collect issues across the whole Tuple.
 *
 * `from` accepts the Tuple Output. When any element Type has a parent,
 * `from.parent` accepts a Tuple of root element Outputs and runs all remaining
 * element stages. This collapsed input boundary keeps a Tuple to at most one
 * `.parent` suffix even when its element Types have different pipeline depths.
 *
 * A Tuple must use this realm's `Array.prototype`, have exactly the declared
 * length, be dense, and have no own properties other than `length` and the
 * indexed data properties for its elements. Array subclasses, custom-prototype
 * arrays, foreign-realm arrays, sparse arrays, accessor elements, and excess
 * properties are rejected.
 *
 * ### Example
 *
 * ```ts
 * import { Number, String, ok, transform, tuple } from "@evolu/common";
 *
 * const NumberFromString = transform("NumberFromString", String, Number, {
 *   from: (value) => ok(globalThis.Number(value)),
 *   to: globalThis.String,
 * });
 *
 * const Entry = tuple(String, NumberFromString);
 *
 * expectOk(Entry.fromUnknown(["count", "1"]), ["count", 1]);
 * expectOk(Entry.from.parent(["count", "1"]), ["count", 1]);
 * ```
 */
export function tuple<const Elements extends TupleElements>(
  ...elements: Elements & TupleValidation<Elements>
): TupleType<Elements>;
export function tuple(...elements: TupleElements): TypeNode {
  return createTupleType(elements as NonEmptyReadonlyArray<RuntimeTypeNode>);
}

const createTupleType = (
  typeElements: NonEmptyReadonlyArray<RuntimeTypeNode>,
): TypeNode => {
  const expectedLength = typeElements.length;
  const validate = (
    value: unknown,
    validateElement: (
      element: RuntimeTypeNode,
      value: unknown,
      options: ValidationOptions,
    ) => Result<unknown, TypeError>,
    options: ValidationOptions,
  ): Result<ReadonlyArray<unknown>, TupleError> => {
    if (!Array.isArray(value)) {
      return err({
        type: "Tuple",
        reason: { kind: "NotArray", value },
      });
    }
    if (!hasCurrentRealmArrayPrototype(value)) {
      return err({
        type: "Tuple",
        reason: { kind: "UnexpectedPrototype", value },
      });
    }
    if (value.length !== expectedLength) {
      return err({
        type: "Tuple",
        reason: {
          kind: "InvalidLength",
          expected: expectedLength,
          actual: value.length,
        },
      });
    }

    return validateTupleItems(
      value,
      typeElements,
      validateElement,
      options,
      true,
    );
  };
  const fromUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) =>
    validate(
      value,
      (element, item, elementOptions) =>
        element.fromUnknown(item, elementOptions),
      options,
    );
  const validateOutput = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) =>
    validate(
      value,
      (element, item, elementOptions) =>
        element[outputValidationSymbol](item, elementOptions),
      options,
    );
  const formatError: TypeErrorFormatter<TupleError> = (error) => {
    if (error.reason.kind === "NotArray") {
      return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a tuple.`;
    }
    if (error.reason.kind === "InvalidLength") {
      return `A Tuple must contain exactly ${error.reason.expected} elements, but the value contains ${error.reason.actual}.`;
    }
    if (error.reason.kind === "Items") {
      const issue = error.reason.issues[0] as TupleStructuralIssue;

      switch (issue.kind) {
        case "Hole":
          return `A Tuple element at index ${issue.index} is missing.`;
        case "Accessor":
          return `A Tuple element at index ${issue.index} must be a data property.`;
        case "ExcessProperty":
          return "An excess Tuple property is not allowed. Remove it or use a different Type.";
      }
    }

    return `The value is an array, but a Tuple Output must use this realm's Array.prototype. ${boundaryRepresentationGuidance}`;
  };
  const rootElements = typeElements.map(
    getTerminalRuntimeNode,
  ) as unknown as NonEmptyReadonlyArray<RuntimeTypeNode>;
  const hasNonRootElement = rootElements.some(
    (rootElement, index) => rootElement !== typeElements[index],
  );
  const parent = hasNonRootElement ? createTupleType(rootElements) : null;
  const fromInputByIndex = typeElements.map((element) =>
    getTerminalRuntimeNode(element[fromSymbol]),
  );
  const fromParent: RuntimeOperation<Result<unknown, TypeError>> | undefined =
    parent
      ? (value: never, options: ValidationOptions = firstValidationOptions) =>
          validateTupleItems(
            value,
            typeElements,
            (_element, item, elementOptions, index) =>
              fromInputByIndex[index](item as never, elementOptions),
            options,
            false,
          )
      : undefined;
  const from = createFromOperation(fromParent);
  const canSkipTo = typeElements.every(
    (element) => element[encoderSymbol] === identity,
  );
  const to: RuntimeEncoder = canSkipTo
    ? identity
    : (value: ReadonlyArray<unknown>) => {
        let output: Array<unknown> | undefined;

        for (let index = 0; index < expectedLength; index++) {
          const item = value[index];
          const encoded = typeElements[index][encoderSymbol](item as never);

          if (!globalThis.Object.is(encoded, item)) {
            output ??= copyArrayPrefix(value, index);
          }
          if (output) output[index] = encoded;
        }

        return output ?? value;
      };
  const is = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (!hasCurrentRealmArrayPrototype(value)) return false;
    if (value.length !== expectedLength) return false;
    if (Reflect.ownKeys(value).length !== expectedLength + 1) return false;

    for (let index = 0; index < expectedLength; index++) {
      const descriptor = globalThis.Object.getOwnPropertyDescriptor(
        value,
        index,
      );
      if (descriptor === undefined || !("value" in descriptor)) return false;
      if (!typeElements[index].is(descriptor.value)) return false;
    }

    return true;
  };
  const getTypeIssues = createCollectionRuntimeTypeIssues(
    "Tuple",
    "Items",
    formatError as TypeErrorFormatter<TypeError>,
    (issue) => typeElements[(issue as { readonly index: number }).index],
  );

  return createTypeNode(
    "Tuple",
    parent,
    fromUnknown,
    is,
    validateOutput,
    from,
    to,
    getTypeIssues,
    { elements: typeElements },
  );
};

/** The fixed-length heterogeneous {@link Type} returned by {@link tuple}. */
export interface TupleType<Elements extends TupleElements> extends Type<
  "Tuple",
  TupleShape<Elements, "Input">,
  TupleShape<Elements, "Output">,
  [TupleParents<Elements>] extends [null]
    ? TupleError<Elements[number]["Error"]>
    : TupleElementsError<TupleFromErrors<Elements>>,
  [TupleParents<Elements>] extends [null]
    ? null
    : RootTupleType<RootTupleElements<Elements>>,
  TupleError<InferErrors<Elements[number]>>
> {
  readonly elements: Elements;
}

type TupleElements = NonEmptyReadonlyArray<TypeNode>;

type TupleShape<
  Elements extends TupleElements,
  Field extends "Input" | "Output",
> = {
  readonly [Index in keyof Elements]: Elements[Index][Field];
};

type TupleParents<Elements extends TupleElements> = Elements[number]["parent"];

type TupleFromErrors<Elements extends TupleElements> = {
  readonly [Index in keyof Elements]: Elements[Index] extends TypeNode
    ? TypeFromError<Elements[Index]>
    : never;
}[number];

type RootTupleElements<Elements extends TupleElements> = {
  readonly [Index in keyof Elements]: Elements[Index] extends TypeNode
    ? RootType<Elements[Index]>
    : never;
};

type RootTupleType<Elements extends TupleElements> = Type<
  "Tuple",
  TupleShape<Elements, "Input">,
  TupleShape<Elements, "Output">,
  TupleError<Elements[number]["Error"]>
> & { readonly elements: Elements };

type TupleValidation<Elements extends TupleElements> = [
  ValidateTupleElements<Elements>,
] extends [never]
  ? unknown
  : readonly [ValidationFailure<ValidateTupleElements<Elements>>];

type ValidateTupleElements<Elements extends TupleElements> =
  number extends Elements["length"]
    ? TupleElementsTupleError
    : IsUnion<Elements["length"]> extends false
      ? {
          readonly [Index in keyof Elements & `${number}`]: IsUnion<
            Elements[Index]
          > extends false
            ? Elements[Index] extends ConcreteTypeNode
              ? never
              : TupleElementConcreteTypeError
            : TupleElementConcreteTypeError;
        }[keyof Elements & `${number}`]
      : TupleElementsTupleError;

type TupleElementsTupleError = CompileTimeError<
  "Type",
  "Elements must use one concrete finite non-empty tuple of Types."
>;

type TupleElementConcreteTypeError = CompileTimeError<
  "Type",
  "Element must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
>;

/** An error returned while validating a {@link tuple}. */
export type TupleError<Error extends TypeError = TypeError> =
  | TupleNotArrayError
  | TupleUnexpectedPrototypeError
  | TupleInvalidLengthError
  | TupleItemsErrorValue<Error, true>;

/** An error returned when a {@link tuple} input is not an Array. */
export interface TupleNotArrayError extends TypeError<"Tuple"> {
  readonly reason: {
    readonly kind: "NotArray";
    readonly value: unknown;
  };
}

/** An error returned when a {@link tuple} input has an unexpected prototype. */
export interface TupleUnexpectedPrototypeError extends TypeError<"Tuple"> {
  readonly reason: {
    readonly kind: "UnexpectedPrototype";
    readonly value: ReadonlyArray<unknown>;
  };
}

/** An error returned when a {@link tuple} input has the wrong length. */
export interface TupleInvalidLengthError extends TypeError<"Tuple"> {
  readonly reason: {
    readonly kind: "InvalidLength";
    readonly expected: number;
    readonly actual: number;
  };
}

/** An error containing structural or element issues found in a {@link tuple}. */
export type TupleItemsError<Error extends TypeError> = TupleItemsErrorValue<
  Error,
  true
>;

/** One structural or element issue found in a {@link tuple}. */
export type TupleIssue<Error extends TypeError> =
  TupleStructuralIssue | TupleElementIssue<Error>;

/** A missing indexed element in a {@link tuple}. */
export interface TupleHoleIssue {
  readonly kind: "Hole";
  readonly index: number;
}

/** An accessor element in a {@link tuple}. */
export interface TupleAccessorIssue {
  readonly kind: "Accessor";
  readonly index: number;
}

/** An undeclared own property in a {@link tuple}. */
export interface TupleExcessPropertyIssue {
  readonly kind: "ExcessProperty";
  readonly key: string | symbol;
}

type TupleStructuralIssue =
  TupleHoleIssue | TupleAccessorIssue | TupleExcessPropertyIssue;

/** An error returned by one element Type in a {@link tuple}. */
export type TupleElementIssue<Error extends TypeError> = Error extends TypeError
  ? {
      readonly kind: "Element";
      readonly index: number;
      readonly error: Error;
    }
  : never;

/** Element errors possible after a typed {@link tuple} boundary was asserted. */
export type TupleElementsError<Error extends TypeError> = [Error] extends [
  never,
]
  ? never
  : TupleItemsErrorValue<Error, false>;

interface TupleItemsErrorValue<
  Error extends TypeError,
  IncludeStructuralIssues extends boolean,
> extends TypeError<"Tuple"> {
  readonly reason: {
    readonly kind: "Items";
    readonly issues: NonEmptyReadonlyArray<
      | (true extends IncludeStructuralIssues ? TupleStructuralIssue : never)
      | TupleElementIssue<Error>
    >;
  };
}

const validateTupleItems = (
  value: ReadonlyArray<unknown>,
  elements: NonEmptyReadonlyArray<RuntimeTypeNode>,
  validate: (
    element: RuntimeTypeNode,
    value: unknown,
    options: ValidationOptions,
    index: number,
  ) => Result<unknown, TypeError>,
  options: ValidationOptions,
  checkStructure: boolean,
): Result<ReadonlyArray<unknown>, TupleItemsError<TypeError>> => {
  let issues: Array<TupleIssue<TypeError>> | undefined;
  let output: Array<unknown> | undefined;

  if (checkStructure) {
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key === "string") {
        const index = globalThis.Number(key) >>> 0;
        if (index < value.length && globalThis.String(index) === key) {
          continue;
        }
      }

      (issues ??= []).push({ kind: "ExcessProperty", key });
      if (options.errors === "first") break;
    }
  }

  for (
    let index = 0;
    (issues === undefined || options.errors === "all") &&
    index < elements.length;
    index++
  ) {
    let item: unknown;

    if (checkStructure) {
      const descriptor = globalThis.Object.getOwnPropertyDescriptor(
        value,
        index,
      );

      if (descriptor === undefined) {
        (issues ??= []).push({ kind: "Hole", index });

        if (options.errors === "first") break;
        continue;
      }
      if (!("value" in descriptor)) {
        (issues ??= []).push({ kind: "Accessor", index });

        if (options.errors === "first") break;
        continue;
      }
      item = descriptor.value;
    } else {
      item = value[index];
    }
    const result = validate(elements[index], item, options, index);

    if (result.ok) {
      if (issues !== undefined) continue;

      if (!globalThis.Object.is(result.value, item)) {
        output ??= copyArrayPrefix(value, index);
      }
      if (output) output[index] = result.value;
      continue;
    }

    (issues ??= []).push({ kind: "Element", index, error: result.error });

    if (options.errors === "first") break;
  }

  return issues === undefined
    ? ok(output ?? value)
    : err({
        type: "Tuple",
        reason: {
          kind: "Items",
          issues: issues as unknown as NonEmptyReadonlyArray<
            TupleIssue<TypeError>
          >,
        },
      });
};

const createObjectRuntimeTypeIssues =
  (
    defaultFormatter: TypeErrorFormatter<TypeError>,
    props?: Readonly<Record<string, RuntimeObjectProperty>>,
    recordType?: RuntimeRecordTypeNode,
  ): RuntimeGetTypeIssues =>
  (error, mode) => {
    const objectError = error as ObjectError;

    if (objectError.reason.kind !== "Properties") {
      return singleRuntimeTypeIssue("Object", error, defaultFormatter);
    }

    const propertyErrors = objectError.reason.errors;
    const keys = Reflect.ownKeys(propertyErrors);
    const firstKey = keys[0];
    assertNonNullable(firstKey);
    const keysToVisit = mode === "first" ? [firstKey] : keys;

    return keysToVisit.flatMap((key) => {
      const propertyError = (
        propertyErrors as Readonly<Partial<Record<PropertyKey, TypeError>>>
      )[key]!;
      const property =
        typeof key === "string" &&
        props !== undefined &&
        globalThis.Object.hasOwn(props, key)
          ? props[key]
          : undefined;

      if (
        propertyError.type === "ObjectPropertyAccess" ||
        propertyError.type === "ObjectMissingProperty" ||
        propertyError.type === "ObjectExcessProperty" ||
        (property === undefined && recordType === undefined)
      ) {
        let ownError = error;

        if (mode === "all") {
          const errors = createMutableRecord<string, TypeError>() as Record<
            PropertyKey,
            TypeError
          >;
          errors[key] = propertyError;
          ownError = {
            type: "Object",
            reason: { kind: "Properties", errors },
          } as TypeError;
        }

        return singleRuntimeTypeIssue("Object", ownError, defaultFormatter, [
          key,
        ]);
      }

      if (property !== undefined) {
        return prependRuntimeTypeIssuePath(
          key,
          objectPropertyToType(property)[getRuntimeTypeIssuesSymbol](
            propertyError,
            mode,
          ),
        );
      }

      return recordType![getRuntimeTypeIssuesSymbol](propertyError, mode);
    }) as unknown as NonEmptyReadonlyArray<RuntimeTypeIssue>;
  };

type PlainObjectError = ObjectError<
  Readonly<Record<never, never>>,
  ObjectPropertyAccessError | TypeOfError<"String">
>;

const formatPlainObjectError: TypeErrorFormatter<PlainObjectError> = (
  error,
) => {
  if (error.reason.kind !== "Properties") {
    return formatPlainObjectRootError(error.reason);
  }

  const key = Reflect.ownKeys(error.reason.errors).at(0);
  assertNonNullable(key);
  const propertyError = error.reason.errors[key];
  assertNonNullable(propertyError);

  if (propertyError.type === "ObjectPropertyAccess") {
    return propertyError.reason === "Accessor"
      ? "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type."
      : "An Object property must be enumerable. Make it enumerable or use a different Type.";
  }
  return "An Object property key must be a string. Remove it or use a different Type.";
};

/**
 * A {@link Type} for readonly plain objects with unknown property values.
 *
 * `Object` is the runtime counterpart of a `Readonly<Record<string, unknown>>`
 * data boundary. It accepts ordinary objects from this realm and objects with a
 * `null` prototype. Every own property must have a string key and be an
 * enumerable data property. It rejects class instances, custom and
 * foreign-realm prototypes, accessors, non-enumerable properties, and symbol
 * properties without reading their values.
 *
 * Use {@link object} when property names are fixed, {@link record} when keys and
 * values have their own Types, and {@link createInstanceOfType} when an instance
 * belongs to the domain.
 */
export const Object: Type<
  "Object",
  Readonly<Record<string, unknown>>,
  Readonly<Record<string, unknown>>,
  PlainObjectError
> = /*#__PURE__*/ createRootType(
  "Object",
  (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ): Result<Readonly<Record<string, unknown>>, PlainObjectError> => {
    if (value === null || typeof value !== "object") {
      return err({
        type: "Object",
        reason: { kind: "NotObject", value },
      });
    }
    if (!hasPlainObjectPrototype(value)) {
      return err({
        type: "Object",
        reason: { kind: "UnexpectedPrototype", value },
      });
    }

    let errors: RuntimeObjectPropertyErrors | undefined;

    for (const key of Reflect.ownKeys(value)) {
      let propertyError:
        ObjectPropertyAccessError | TypeOfError<"String"> | undefined;

      if (typeof key !== "string") {
        propertyError = { type: "TypeOf", expected: "String", value: key };
      } else {
        const descriptor = globalThis.Object.getOwnPropertyDescriptor(
          value,
          key,
        );
        assert(
          descriptor !== undefined,
          "Object property descriptor is missing.",
        );

        if (!("value" in descriptor)) {
          propertyError = {
            type: "ObjectPropertyAccess",
            reason: "Accessor",
          };
        } else if (!descriptor.enumerable) {
          propertyError = {
            type: "ObjectPropertyAccess",
            reason: "NonEnumerable",
          };
        }
      }

      if (propertyError === undefined) continue;

      errors ??= createMutableRecord<string, TypeError>();
      errors[key] = propertyError;
      if (options.errors === "first") break;
    }

    return errors === undefined
      ? ok(value as Readonly<Record<string, unknown>>)
      : err({
          type: "Object",
          reason: { kind: "Properties", errors },
        } as PlainObjectError);
  },
  formatPlainObjectError,
  /*#__PURE__*/ createObjectRuntimeTypeIssues(
    formatPlainObjectError as TypeErrorFormatter<TypeError>,
  ),
);

const hasPlainObjectPrototype = (value: object): boolean => {
  const prototype: unknown = globalThis.Object.getPrototypeOf(value);
  return prototype === globalThis.Object.prototype || prototype === null;
};

const formatPlainObjectRootError = (
  reason:
    ObjectNotObjectError["reason"] | ObjectUnexpectedPrototypeError["reason"],
): string =>
  reason.kind === "NotObject"
    ? `A value ${safelyStringifyUnknownValue(reason.value)} is not an object.`
    : `The value is an object, but an Object Output must use this realm's Object.prototype or null. ${boundaryRepresentationGuidance}`;

/**
 * Record {@link Type}.
 *
 * Use `record(Key, Value)` for readonly Records with dynamic string keys, such
 * as scores by user ID or settings by name. Use {@link object} when property
 * names are fixed.
 *
 * `fromUnknown` validates the Record and runs the complete `Key` and `Value`
 * pipelines. `from` accepts the Record Output. When either entry Type has a
 * parent, `from.parent` accepts a Record of their root Outputs and runs their
 * remaining stages. This collapsed input boundary keeps a Record to at most one
 * `.parent` suffix.
 *
 * By default, validation returns the first issue. Pass `{ errors: "all" }` to
 * collect issues across the whole Record.
 *
 * A Record must use this realm's `Object.prototype` or `null`. Class instances,
 * custom-prototype objects, and foreign-realm objects are rejected. Every own
 * property must be an enumerable data property whose key and value satisfy
 * their Types. When decoding or encoding changes an entry, the constructed
 * Record uses a `null` prototype so keys such as `__proto__` remain ordinary
 * data.
 *
 * If transformed keys collide, validation fails instead of overwriting an
 * entry.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   Number,
 *   String,
 *   ok,
 *   record,
 *   transform,
 *   type Result,
 * } from "@evolu/common";
 *
 * const ScoreFromString = transform("ScoreFromString", String, Number, {
 *   from: (value) => ok(globalThis.Number(value)),
 *   to: globalThis.String,
 * });
 *
 * const ScoresByUser = record(String, ScoreFromString);
 * type ScoresByUser = typeof ScoresByUser.Output;
 *
 * // Validate an unknown value.
 * const scoresFromUnknown = ScoresByUser.fromUnknown({
 *   ada: "10",
 *   grace: "20",
 * });
 *
 * expectOk(scoresFromUnknown, { ada: 10, grace: 20 });
 *
 * // Validate keys and values with their root Types.
 * const scoresInput = ScoresByUser.parent.fromUnknown({
 *   ada: "10",
 *   grace: "20",
 * });
 * expectOk(scoresInput, { ada: "10", grace: "20" });
 *
 * // Run the remaining key and value stages.
 * const scoresFromInput = ScoresByUser.from.parent(scoresInput.value);
 *
 * expectTypeOf(scoresFromInput).toEqualTypeOf<
 *   Result<Readonly<Partial<Record<string, number>>>, never>
 * >();
 *
 * expectOk(scoresFromInput, { ada: 10, grace: 20 });
 * ```
 *
 * Note that TypeScript does not model an object's runtime prototype. This can
 * make a plain TypeScript Record interpret an inherited `Object.prototype` name
 * as a Record entry:
 *
 * ```ts
 * type Values = Partial<Record<"toString", number>>;
 * const values: Values = {};
 *
 * // TypeScript treats the inherited function as `number | undefined`.
 * const value: number | undefined = values.toString;
 *
 * expect(typeof value).toBe("function");
 * expect(() => {
 *   if (value !== undefined) value.toFixed();
 * }).toThrow(TypeError);
 * ```
 *
 * Evolu Record Outputs use the same TypeScript Record representation.
 *
 * ```ts
 * import { Number, literal, record } from "@evolu/common";
 *
 * const Values = record(literal("toString"), Number);
 * const result = Values.fromUnknown({});
 *
 * expectOk(result, {});
 *
 * const value: number | undefined = result.value.toString;
 *
 * expect(typeof value).toBe("function");
 * expect(() => {
 *   if (value !== undefined) value.toFixed();
 * }).toThrow(TypeError);
 * ```
 *
 * In other words, treat Record Outputs as string-keyed data rather than calling
 * inherited object methods through them.
 */
export const record = <
  KeyType extends ConcreteTypeNode,
  ValueType extends ConcreteTypeNode,
>(
  key: ValidateRecordKeyType<KeyType>,
  value: ValidateRecordValueType<ValueType>,
): RecordType<KeyType, ValueType> => {
  const typeKey = key as unknown as KeyType & RuntimeRecordKeyTypeNode;
  const typeValue = value as unknown as ValueType & RuntimeTypeNode;

  const validate = (
    input: unknown,
    validateKey: RuntimeOutputValidation,
    validateValue: RuntimeOutputValidation,
    options: ValidationOptions,
  ): Result<Readonly<Record<string, unknown>>, RecordError> => {
    if (input === null || typeof input !== "object") {
      return err({
        type: "Record",
        reason: { kind: "NotRecord", value: input },
      });
    }
    if (!hasPlainObjectPrototype(input)) {
      return err({
        type: "Record",
        reason: { kind: "NotPlainRecord", value: input },
      });
    }

    return validateRecordEntries(
      input as Readonly<Record<string, unknown>>,
      validateKey as (
        value: unknown,
        options: ValidationOptions,
      ) => Result<string, TypeError>,
      validateValue,
      options,
    );
  };
  const fromUnknown = (
    input: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => validate(input, typeKey.fromUnknown, typeValue.fromUnknown, options);
  const validateOutput = (
    input: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) =>
    validate(
      input,
      typeKey[outputValidationSymbol],
      typeValue[outputValidationSymbol],
      options,
    );
  const formatError: TypeErrorFormatter<RecordError> = (error) => {
    if (error.reason.kind === "NotRecord") {
      return `A value ${safelyStringifyUnknownValue(error.reason.value)} is not a record.`;
    }
    if (error.reason.kind === "NotPlainRecord") {
      return `The value is an object, but a Record Output must use this realm's Object.prototype or null. ${boundaryRepresentationGuidance}`;
    }

    const issue = error.reason.issues[0] as RecordStructuralIssue;

    switch (issue.kind) {
      case "Accessor":
        return `A record property ${safelyStringifyUnknownValue(issue.key)} must be a data property.`;
      case "NonEnumerable":
        return `A record property ${safelyStringifyUnknownValue(issue.key)} must be enumerable.`;
      case "Collision":
        return `Record keys ${safelyStringifyUnknownValue(issue.previousKey)} and ${safelyStringifyUnknownValue(issue.key)} decode to the same key ${safelyStringifyUnknownValue(issue.outputKey)}.`;
    }
  };
  const rootKey = getTerminalRuntimeNode(typeKey);
  const rootValue = getTerminalRuntimeNode(typeValue);

  const parent =
    rootKey !== typeKey || rootValue !== typeValue
      ? (
          record as unknown as (
            key: ConcreteTypeNode,
            value: ConcreteTypeNode,
          ) => TypeNode
        )(
          rootKey as unknown as ConcreteTypeNode,
          rootValue as unknown as ConcreteTypeNode,
        )
      : null;
  const fromParent = parent
    ? (input: never, options: ValidationOptions = firstValidationOptions) =>
        validateRecordEntries(
          input,
          getTerminalRuntimeNode(typeKey[fromSymbol]) as unknown as (
            value: unknown,
            options: ValidationOptions,
          ) => Result<string, TypeError>,
          getTerminalRuntimeNode(typeValue[fromSymbol]) as unknown as (
            value: unknown,
            options: ValidationOptions,
          ) => Result<unknown, TypeError>,
          options,
        )
    : undefined;
  const from = createFromOperation(fromParent);
  const encodeKey = typeKey[encoderSymbol];
  const encodeValue = typeValue[encoderSymbol];
  const to: RuntimeEncoder =
    encodeKey === identity && encodeValue === identity
      ? identity
      : (input: Readonly<Record<string, unknown>>) => {
          const output = createMutableRecord<string, unknown>();
          let changed = false;

          for (const inputKey of globalThis.Object.keys(input)) {
            const inputValue = input[inputKey];
            const outputKey = encodeKey(inputKey as never) as string;
            const outputValue = encodeValue(inputValue as never);

            assert(
              !globalThis.Object.hasOwn(output, outputKey),
              "Record key Type encoding must not produce duplicate keys.",
            );
            output[outputKey] = outputValue;

            if (
              inputKey !== outputKey ||
              !globalThis.Object.is(inputValue, outputValue)
            ) {
              changed = true;
            }
          }

          return changed ? output : input;
        };
  const is = (input: unknown): boolean => {
    if (input === null || typeof input !== "object") return false;
    if (!hasPlainObjectPrototype(input)) return false;

    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== "string" || !typeKey.is(key)) return false;

      const descriptor = globalThis.Object.getOwnPropertyDescriptor(input, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return false;
      }
      if (!typeValue.is(descriptor.value)) return false;
    }

    return true;
  };
  const getTypeIssues = createCollectionRuntimeTypeIssues(
    "Record",
    "Entries",
    formatError as TypeErrorFormatter<TypeError>,
    (issue) => (issue.kind === "Key" ? typeKey : typeValue),
  );

  return createTypeNode<RecordType<KeyType, ValueType>>(
    "Record",
    parent,
    fromUnknown,
    is,
    validateOutput,
    from,
    to,
    getTypeIssues,
    { key: typeKey, value: typeValue },
  );
};

export interface RecordType<
  KeyType extends TypeNode,
  ValueType extends TypeNode,
> extends Type<
  "Record",
  RecordShape<KeyType, ValueType, "Input">,
  RecordShape<KeyType, ValueType, "Output">,
  RecordNodeError<KeyType, ValueType>,
  RecordParent<KeyType, ValueType>,
  RecordError<
    InferErrors<KeyType>,
    InferErrors<ValueType>,
    RecordCollisionFor<KeyType>
  >
> {
  readonly key: KeyType;
  readonly value: ValueType;
}

interface RecordTypeNode extends TypeNode {
  readonly name: "Record";
  readonly key: TypeNode;
  readonly value: TypeNode;
}

interface ObjectRecordTypeNode extends RecordTypeNode {
  readonly key: typeof String;
}

type RuntimeRecordKeyTypeNode = Omit<
  RuntimeTypeNode,
  "fromUnknown" | "from" | "to"
> & {
  readonly fromUnknown: (
    value: unknown,
    options: ValidationOptions,
  ) => Result<string, TypeError>;
  readonly from: RuntimeOperation<Result<string, TypeError>>;
  readonly to: (value: never) => string;
};

interface RuntimeRecordTypeNode extends RuntimeTypeNode {
  readonly name: "Record";
  readonly key: RuntimeRecordKeyTypeNode;
  readonly value: RuntimeTypeNode;
}

type RecordShape<
  KeyType extends TypeNode,
  ValueType extends TypeNode,
  Field extends "Input" | "Output",
> = [Extract<KeyType[Field], string>] extends [never]
  ? Readonly<Record<string, never>>
  : Readonly<
      Partial<Record<Extract<KeyType[Field], string>, ValueType[Field]>>
    >;

type RecordParent<KeyType extends TypeNode, ValueType extends TypeNode> = [
  KeyType["parent"] | ValueType["parent"],
] extends [null]
  ? null
  : RecordType<RootType<KeyType>, RootType<ValueType>>;

type RecordNodeError<KeyType extends TypeNode, ValueType extends TypeNode> = [
  KeyType["parent"] | ValueType["parent"],
] extends [null]
  ? RecordError<InferErrors<KeyType>, InferErrors<ValueType>, never>
  : RecordEntriesError<
      TypeFromError<KeyType>,
      TypeFromError<ValueType>,
      RecordCollisionFor<KeyType>
    >;

type RecordCollisionFor<KeyType extends TypeNode> = [
  KeyType["parent"],
] extends [TypeNode]
  ? RecordCollisionIssue
  : never;

type ValidateRecordKeyType<T extends ConcreteTypeNode> =
  IsUnion<T> extends false
    ? [T["Input"]] extends [string]
      ? [T["Output"]] extends [string]
        ? T
        : RecordKeyStringTypeError
      : RecordKeyStringTypeError
    : RecordKeyConcreteTypeError;

type ValidateRecordValueType<T extends ConcreteTypeNode> =
  IsUnion<T> extends false ? T : RecordValueConcreteTypeError;

type RecordKeyConcreteTypeError = CompileTimeError<
  "Type",
  "Record key must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
>;

type RecordValueConcreteTypeError = CompileTimeError<
  "Type",
  "Record value must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
>;

type RecordKeyStringTypeError = CompileTimeError<
  "Type",
  "Record key Type Input and Output must extend string."
>;

export type RecordError<
  KeyError extends TypeError = TypeError,
  ValueError extends TypeError = TypeError,
  Collision extends RecordCollisionIssue = RecordCollisionIssue,
> =
  | RecordNotRecordError
  | RecordNotPlainRecordError
  | RecordEntriesErrorValue<
      KeyError,
      ValueError,
      Collision | RecordAccessorIssue | RecordNonEnumerableIssue
    >;

export interface RecordNotRecordError extends TypeError<"Record"> {
  readonly reason: {
    readonly kind: "NotRecord";
    readonly value: unknown;
  };
}

export interface RecordNotPlainRecordError extends TypeError<"Record"> {
  readonly reason: {
    readonly kind: "NotPlainRecord";
    readonly value: object;
  };
}

/**
 * Entry errors returned by a {@link record} operation.
 *
 * Property structure is omitted by default because typed operations assert
 * enumerable own data properties. {@link RecordError} includes structural issues
 * at the unknown-input boundary.
 */
export type RecordEntriesError<
  KeyError extends TypeError,
  ValueError extends TypeError,
  StructuralIssue extends RecordStructuralIssue = RecordCollisionIssue,
> = [KeyError | ValueError | StructuralIssue] extends [never]
  ? never
  : RecordEntriesErrorValue<KeyError, ValueError, StructuralIssue>;

export type RecordIssue<
  KeyError extends TypeError,
  ValueError extends TypeError,
  StructuralIssue extends RecordStructuralIssue = RecordCollisionIssue,
> = RecordKeyIssue<KeyError> | RecordValueIssue<ValueError> | StructuralIssue;

export type RecordStructuralIssue =
  RecordAccessorIssue | RecordCollisionIssue | RecordNonEnumerableIssue;

/** An accessor property rejected by {@link record}. */
export interface RecordAccessorIssue {
  readonly kind: "Accessor";
  readonly key: string | symbol;
}

/** A non-enumerable property rejected by {@link record}. */
export interface RecordNonEnumerableIssue {
  readonly kind: "NonEnumerable";
  readonly key: string | symbol;
}

export type RecordKeyIssue<Error extends TypeError> = Error extends TypeError
  ? {
      readonly kind: "Key";
      readonly key: string | symbol;
      readonly error: Error;
    }
  : never;

export type RecordValueIssue<Error extends TypeError> = Error extends TypeError
  ? {
      readonly kind: "Value";
      readonly key: string | symbol;
      readonly error: Error;
    }
  : never;

export interface RecordCollisionIssue {
  readonly kind: "Collision";
  readonly key: string | symbol;
  readonly previousKey: string | symbol;
  readonly outputKey: string;
}

interface RecordEntriesErrorValue<
  KeyError extends TypeError,
  ValueError extends TypeError,
  StructuralIssue extends RecordStructuralIssue,
> extends TypeError<"Record"> {
  readonly reason: {
    readonly kind: "Entries";
    readonly issues: NonEmptyReadonlyArray<
      RecordKeyIssue<KeyError> | RecordValueIssue<ValueError> | StructuralIssue
    >;
  };
}

const validateRecordEntries = (
  input: Readonly<Record<string, unknown>>,
  validateKey: (
    value: unknown,
    options: ValidationOptions,
  ) => Result<string, TypeError>,
  validateValue: (
    value: unknown,
    options: ValidationOptions,
  ) => Result<unknown, TypeError>,
  options: ValidationOptions,
): Result<
  Readonly<Record<string, unknown>>,
  RecordEntriesErrorValue<TypeError, TypeError, RecordStructuralIssue>
> => {
  let issues:
    Array<RecordIssue<TypeError, TypeError, RecordStructuralIssue>> | undefined;
  const output = createMutableRecord<string, unknown>();
  const inputKeyByOutputKey = createMutableRecord<string, string | symbol>();
  let changed = false;

  for (const inputKey of Reflect.ownKeys(input)) {
    const keyResult = validateKey(inputKey, options);

    if (!keyResult.ok) {
      (issues ??= []).push({
        kind: "Key",
        key: inputKey,
        error: keyResult.error,
      });
      if (options.errors === "first") break;
    }

    const descriptor = globalThis.Object.getOwnPropertyDescriptor(
      input,
      inputKey,
    );
    assert(descriptor !== undefined, "Record property descriptor is missing.");
    let inputValue: unknown = undefined;
    let hasInputValue = false;

    if (!("value" in descriptor)) {
      (issues ??= []).push({ kind: "Accessor", key: inputKey });
      if (options.errors === "first") break;
    } else if (!descriptor.enumerable) {
      (issues ??= []).push({ kind: "NonEnumerable", key: inputKey });
      if (options.errors === "first") break;
    } else {
      inputValue = descriptor.value;
      hasInputValue = true;
    }

    const valueResult = hasInputValue
      ? validateValue(inputValue, options)
      : undefined;
    if (valueResult !== undefined && !valueResult.ok) {
      (issues ??= []).push({
        kind: "Value",
        key: inputKey,
        error: valueResult.error,
      });
      if (options.errors === "first") break;
    }

    if (!keyResult.ok) continue;
    const outputKey = keyResult.value;

    if (globalThis.Object.hasOwn(inputKeyByOutputKey, outputKey)) {
      (issues ??= []).push({
        kind: "Collision",
        key: inputKey,
        previousKey: inputKeyByOutputKey[outputKey],
        outputKey,
      });
      if (options.errors === "first") break;
      continue;
    }

    inputKeyByOutputKey[outputKey] = inputKey;
    if (!hasInputValue || !valueResult?.ok) continue;

    output[outputKey] = valueResult.value;
    if (
      inputKey !== outputKey ||
      !globalThis.Object.is(inputValue, valueResult.value)
    ) {
      changed = true;
    }
  }

  return issues == null
    ? ok(changed ? output : input)
    : err({
        type: "Record",
        reason: {
          kind: "Entries",
          issues: issues as unknown as NonEmptyReadonlyArray<
            RecordIssue<TypeError, TypeError, RecordStructuralIssue>
          >,
        },
      });
};

/** An optional property used to construct an {@link object} Type. */
export interface OptionalProperty<T extends TypeNode> {
  readonly type: T;
  readonly [errorsSymbol]: InferErrors<T>;
  readonly [optionalPropertySymbol]: true;
}

/**
 * Optional {@link object} property.
 *
 * An optional property may be absent. If present, its value is validated by the
 * provided Type, so optionality does not implicitly accept `undefined`. Use
 * {@link undefinedOr} when a present property may contain `undefined`.
 *
 * ### Example
 *
 * ```ts
 * import { String, object, optional, undefinedOr } from "@evolu/common";
 *
 * const User = object({
 *   name: String,
 *   nickname: optional(String),
 *   preferredName: optional(undefinedOr(String)),
 * });
 *
 * expectOk(User.fromUnknown({ name: "Ada" }), { name: "Ada" });
 * expectOk(User.fromUnknown({ name: "Ada", preferredName: undefined }), {
 *   name: "Ada",
 *   preferredName: undefined,
 * });
 * ```
 */
export const optional = <T extends TypeNode>(
  type: ValidateOptionalPropertyType<T>,
): OptionalProperty<T> =>
  ({
    type: type as T,
    [optionalPropertySymbol]: true,
  }) as OptionalProperty<T>;

const optionalPropertySymbol = /*#__PURE__*/ globalThis.Symbol();

type ValidateOptionalPropertyType<T extends TypeNode> =
  IsUnion<T> extends false
    ? T extends ConcreteTypeNode
      ? T
      : ObjectPropertyTypeError
    : ObjectPropertyTypeError;

/** Properties used to construct an {@link object} Type. */
export type ObjectProps = Readonly<
  Record<string, TypeNode | OptionalProperty<TypeNode>>
>;

type ObjectProperty = ObjectProps[string];

/**
 * Plain object {@link Type}.
 *
 * Use `object(props)` for objects with fixed property names. Properties are
 * required unless wrapped with {@link optional}. An optional property may be
 * absent, but a present value is still validated and does not implicitly accept
 * `undefined`.
 *
 * Without a second argument, `fromUnknown` rejects additional properties. Pass
 * a {@link record} with the predefined {@link String} key Type to validate and
 * preserve additional string-keyed properties.
 *
 * `fromUnknown` requires a plain object. Plain object Types model only own
 * enumerable data properties, so Object prototype properties neither satisfy
 * required properties nor make optional properties present. This keeps Outputs
 * valid after ordinary object spread restores `Object.prototype`.
 *
 * Class instances, custom and foreign-realm prototypes, accessors, and
 * non-enumerable properties are rejected. Use {@link createInstanceOfType} for
 * class Outputs or {@link transform} to decode instances into plain data.
 *
 * When decoding changes no property, it preserves the input. When decoding or
 * encoding changes a property, it constructs an object with a `null`
 * prototype.
 *
 * By default, validation returns the first property issue. Pass `{ errors:
 * "all" }` to collect all issues.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   Number,
 *   String,
 *   object,
 *   ok,
 *   transform,
 *   type Result,
 * } from "@evolu/common";
 *
 * const AgeFromString = transform("AgeFromString", String, Number, {
 *   from: (value) => ok(globalThis.Number(value)),
 *   to: globalThis.String,
 * });
 *
 * const User = object({
 *   name: String,
 *   age: AgeFromString,
 * });
 * type User = typeof User.Output;
 *
 * // Validate an unknown value.
 * const userFromUnknown = User.fromUnknown({ name: "Ada", age: "42" });
 *
 * expectOk(userFromUnknown, { name: "Ada", age: 42 });
 *
 * // Validate the object and root property Types.
 * const userInput = User.parent.fromUnknown({
 *   name: "Ada",
 *   age: "42",
 * });
 * expectOk(userInput, { name: "Ada", age: "42" });
 *
 * // Run the remaining property stages.
 * const userFromInput: Result<
 *   { readonly name: string; readonly age: number },
 *   never
 * > = User.from.parent(userInput.value);
 *
 * expectTypeOf(userFromInput).toEqualTypeOf<
 *   Result<{ readonly name: string; readonly age: number }, never>
 * >();
 * expectOk(userFromInput, { name: "Ada", age: 42 });
 * ```
 *
 * Note that TypeScript does not model an object's runtime prototype. This can
 * make a plain TypeScript object interpret an inherited `Object.prototype` name
 * as an object property:
 *
 * ```ts
 * interface Values {
 *   readonly toString?: number;
 * }
 *
 * const nullPrototypeValues = globalThis.Object.create(null) as Values;
 * const values = { ...nullPrototypeValues };
 *
 * // TypeScript treats the inherited function as `number | undefined`.
 * const value: number | undefined = values.toString;
 *
 * expect(typeof value).toBe("function");
 * expect(() => {
 *   if (value !== undefined) value.toFixed();
 * }).toThrow(TypeError);
 * ```
 *
 * Evolu Object Outputs use the same TypeScript object representation.
 *
 * ```ts
 * import { Number, object, optional } from "@evolu/common";
 *
 * const Values = object({ toString: optional(Number) });
 * const result = Values.fromUnknown({});
 *
 * expectOk(result, {});
 *
 * const value: number | undefined = result.value.toString;
 *
 * expect(typeof value).toBe("function");
 * expect(() => {
 *   if (value !== undefined) value.toFixed();
 * }).toThrow(TypeError);
 * ```
 *
 * In other words, treat Object Outputs as data rather than calling inherited
 * object methods through them.
 */
export function object<const Props extends ObjectProps>(
  props: Props,
  ...validation: [ObjectValidationError<Props>] extends [never]
    ? []
    : [ValidationFailure<ObjectValidationError<Props>>]
): StrictObjectType<Props>;
export function object<
  const Props extends ObjectProps,
  const Rest extends RecordTypeNode & ConcreteTypeNode,
>(
  props: Props,
  record: Rest,
  ...validation: [
    ObjectValidationError<Props> | ObjectRecordValidationError<Props, Rest>,
  ] extends [never]
    ? []
    : [
        ValidationFailure<
          | ObjectValidationError<Props>
          | ObjectRecordValidationError<Props, Rest>
        >,
      ]
): ObjectWithRecordType<
  Props,
  Rest extends ObjectRecordTypeNode ? Rest : never
>;
export function object(props: ObjectProps, recordType?: unknown): TypeNode {
  return createObjectType(
    snapshotObjectProps(props),
    recordType as RuntimeRecordTypeNode | undefined,
  );
}

const createObjectType = (
  props: ObjectProps,
  recordType?: RuntimeRecordTypeNode,
): ObjectTypeNode => {
  const runtimeProps = props as Readonly<Record<string, RuntimeObjectProperty>>;
  const keys = globalThis.Object.keys(runtimeProps);

  const validate = (
    value: unknown,
    options: ValidationOptions,
    exactOutput: boolean,
  ): Result<Readonly<Record<string, unknown>>, ObjectError> => {
    if (value === null || typeof value !== "object") {
      return err({
        type: "Object",
        reason: { kind: "NotObject", value },
      });
    }
    const input = value as Readonly<Record<string, unknown>>;
    if (!hasPlainObjectPrototype(input)) {
      return err({
        type: "Object",
        reason: { kind: "UnexpectedPrototype", value: input },
      });
    }
    let errors: RuntimeObjectPropertyErrors | undefined;
    let output: Record<string | symbol, unknown> | undefined;
    const inputDescriptorByKey = new Map<
      string | symbol,
      PropertyDescriptor | undefined
    >();

    for (const key of keys) inputDescriptorByKey.set(key, undefined);
    for (const key of Reflect.ownKeys(input)) {
      inputDescriptorByKey.set(key, undefined);
    }

    const setError = (key: string | symbol, error: TypeError): void => {
      errors ??= createMutableRecord<string, TypeError>();
      errors[key] = error;
    };

    for (const [key] of inputDescriptorByKey) {
      const property =
        typeof key === "string" && globalThis.Object.hasOwn(runtimeProps, key)
          ? runtimeProps[key]
          : undefined;
      const descriptor = globalThis.Object.getOwnPropertyDescriptor(input, key);
      inputDescriptorByKey.set(key, descriptor);

      if (descriptor === undefined) {
        assert(property !== undefined, "Object property is missing.");
        if (isOptionalProperty(property)) {
          continue;
        }
        setError(key, { type: "ObjectMissingProperty" });
        if (options.errors === "first") break;
        continue;
      }

      if (property === undefined && recordType === undefined) {
        setError(key, {
          type: "ObjectExcessProperty",
        } satisfies ObjectExcessPropertyError);
        if (options.errors === "first") break;
        continue;
      }

      if (property === undefined && typeof key !== "string") {
        setError(
          key,
          createRecordPropertyError({
            kind: "Key",
            key,
            error: {
              type: "TypeOf",
              expected: "String",
              value: key,
            },
          }),
        );
        if (options.errors === "first") break;
        continue;
      }

      if (!("value" in descriptor)) {
        const propertyError: ObjectPropertyAccessError = {
          type: "ObjectPropertyAccess",
          reason: "Accessor",
        };
        setError(key, propertyError);
        if (options.errors === "first") break;
        continue;
      }
      if (!descriptor.enumerable) {
        const propertyError: ObjectPropertyAccessError = {
          type: "ObjectPropertyAccess",
          reason: "NonEnumerable",
        };
        setError(key, propertyError);
        if (options.errors === "first") break;
        continue;
      }
      const propertyValue: unknown = descriptor.value;

      const propertyType =
        property === undefined
          ? recordType!.value
          : objectPropertyToType(property);
      const result = exactOutput
        ? propertyType[outputValidationSymbol](propertyValue, options)
        : propertyType.fromUnknown(propertyValue, options);

      if (!result.ok) {
        setError(
          key,
          property === undefined
            ? createRecordPropertyError({
                kind: "Value",
                key,
                error: result.error,
              })
            : result.error,
        );
        if (options.errors === "first") break;
        continue;
      }

      if (errors !== undefined) continue;
      if (exactOutput) continue;
      if (
        output === undefined &&
        globalThis.Object.is(result.value, propertyValue)
      ) {
        continue;
      }

      if (output === undefined) {
        output = globalThis.Object.create(null) as Record<
          string | symbol,
          unknown
        >;

        for (const [previousKey, previousDescriptor] of inputDescriptorByKey) {
          if (previousKey === key) break;

          if (
            previousDescriptor !== undefined &&
            "value" in previousDescriptor &&
            previousDescriptor.enumerable
          ) {
            output[previousKey] = previousDescriptor.value;
          }
        }
      }
      output[key] = result.value;
    }

    if (errors !== undefined) {
      return err({
        type: "Object",
        reason: { kind: "Properties", errors },
      });
    }

    if (output === undefined) return ok(input);
    return ok(output);
  };
  const fromUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => validate(value, options, false);
  const validateOutput = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => validate(value, options, true);
  const formatError: TypeErrorFormatter<ObjectError> = (error) => {
    if (error.reason.kind !== "Properties") {
      return formatPlainObjectRootError(error.reason);
    }

    const key = Reflect.ownKeys(error.reason.errors).at(0);
    assertNonNullable(key);
    const propertyError = (
      error.reason.errors as Readonly<Partial<Record<PropertyKey, TypeError>>>
    )[key]!;

    if (propertyError.type === "ObjectPropertyAccess") {
      switch ((propertyError as ObjectPropertyAccessError).reason) {
        case "Accessor":
          return "An Object property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.";
        case "NonEnumerable":
          return "An Object property must be enumerable.";
      }
    }
    if (
      typeof key === "string" &&
      globalThis.Object.hasOwn(runtimeProps, key)
    ) {
      return "A required property is missing.";
    }
    return "An excess property is not allowed. Remove it or use a different Type.";
  };
  const rootProps = createMutableRecord<string, RuntimeObjectProperty>();
  let hasNonRootType = false;
  let canSkipTo =
    recordType === undefined || recordType.value[encoderSymbol] === identity;

  for (const key of keys) {
    const property = runtimeProps[key];
    const type = objectPropertyToType(property);

    if (type[encoderSymbol] !== identity) canSkipTo = false;

    const rootType = getTerminalRuntimeNode(type);
    if (rootType !== type) hasNonRootType = true;

    rootProps[key] = isOptionalProperty(property)
      ? optional(rootType as RuntimeTypeNode & ConcreteTypeNode)
      : rootType;
  }

  const parent =
    hasNonRootType || recordType?.parent
      ? createObjectType(
          rootProps,
          (recordType?.parent ?? recordType) as
            RuntimeRecordTypeNode | undefined,
        )
      : null;
  const inputFromByKey = createMutableRecord<
    string,
    RuntimeOperation<Result<unknown, TypeError>>
  >();

  for (const key of keys) {
    inputFromByKey[key] = getTerminalRuntimeNode(
      objectPropertyToType(runtimeProps[key])[fromSymbol],
    );
  }
  const recordValueFromInput = recordType
    ? getTerminalRuntimeNode(recordType.value[fromSymbol])
    : undefined;
  const fromParent: RuntimeOperation<Result<unknown, TypeError>> | undefined =
    parent
      ? (value: never, options: ValidationOptions = firstValidationOptions) => {
          let errors: RuntimeObjectPropertyErrors | undefined;
          let output: Record<string, unknown> | undefined;

          for (const key of keys) {
            if (!globalThis.Object.hasOwn(value, key)) continue;
            const propertyValue: unknown = value[key];
            const result = inputFromByKey[key](propertyValue as never, options);

            if (result.ok) {
              if (!globalThis.Object.is(result.value, propertyValue)) {
                (output ??= createMutableRecord(value))[key] = result.value;
              }
              continue;
            }

            (errors ??= createMutableRecord<string, TypeError>())[key] =
              result.error;
            if (options.errors === "first") break;
          }

          if (
            recordValueFromInput !== undefined &&
            (errors === undefined || options.errors === "all")
          ) {
            for (const key of globalThis.Object.keys(value)) {
              if (globalThis.Object.hasOwn(runtimeProps, key)) continue;
              const propertyValue: unknown = value[key];
              const result = recordValueFromInput(
                propertyValue as never,
                options,
              );

              if (result.ok) {
                if (!globalThis.Object.is(result.value, propertyValue)) {
                  (output ??= createMutableRecord(value))[key] = result.value;
                }
                continue;
              }

              (errors ??= createMutableRecord<string, TypeError>())[key] =
                createRecordPropertyError({
                  kind: "Value",
                  key,
                  error: result.error,
                });
              if (options.errors === "first") break;
            }
          }

          return errors === undefined
            ? ok(output ?? value)
            : err({
                type: "Object",
                reason: { kind: "Properties", errors },
              });
        }
      : undefined;
  const from = createFromOperation(fromParent);
  const to: RuntimeEncoder = canSkipTo
    ? identity
    : (value: Readonly<Record<string, unknown>>) => {
        let output: Record<string, unknown> | undefined;

        for (const key of keys) {
          if (!globalThis.Object.hasOwn(value, key)) continue;
          const propertyValue = value[key];
          const encoded = objectPropertyToType(runtimeProps[key])[
            encoderSymbol
          ](propertyValue as never);

          if (!globalThis.Object.is(encoded, propertyValue)) {
            (output ??= createMutableRecord(value))[key] = encoded;
          }
        }

        if (recordType) {
          for (const key of globalThis.Object.keys(value)) {
            if (globalThis.Object.hasOwn(runtimeProps, key)) continue;
            const propertyValue = value[key];
            const outputValue = recordType.value[encoderSymbol](
              propertyValue as never,
            );

            if (!globalThis.Object.is(propertyValue, outputValue)) {
              (output ??= createMutableRecord(value))[key] = outputValue;
            }
          }
        }

        return output ?? value;
      };
  const is = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return false;
    if (!hasPlainObjectPrototype(value)) return false;

    for (const key of keys) {
      const property = runtimeProps[key];
      const descriptor = globalThis.Object.getOwnPropertyDescriptor(value, key);

      if (descriptor === undefined) {
        if (!isOptionalProperty(property)) return false;
        continue;
      }

      if (
        !("value" in descriptor) ||
        !descriptor.enumerable ||
        !objectPropertyToType(property).is(descriptor.value)
      ) {
        return false;
      }
    }

    for (const key of Reflect.ownKeys(value)) {
      if (
        typeof key === "string" &&
        globalThis.Object.hasOwn(runtimeProps, key)
      ) {
        continue;
      }
      if (recordType === undefined || typeof key !== "string") return false;

      const descriptor = globalThis.Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return false;
      }
      if (!recordType.value.is(descriptor.value)) return false;
    }

    return true;
  };
  const getTypeIssues = createObjectRuntimeTypeIssues(
    formatError as TypeErrorFormatter<TypeError>,
    runtimeProps,
    recordType,
  );

  return createTypeNode<ObjectTypeNode>(
    "Object",
    parent,
    fromUnknown,
    is,
    validateOutput,
    from,
    to,
    getTypeIssues,
    recordType
      ? {
          props: runtimeProps,
          record: recordType as unknown as RecordTypeNode,
        }
      : { props: runtimeProps },
  );
};

// Read descriptors instead of spreading so accessors are not invoked,
// non-enumerable declarations are retained, and later mutations are isolated.
const snapshotObjectProps = (
  props: ObjectProps,
  runtimeProps: Record<string, ObjectProperty> = createMutableRecord<
    string,
    ObjectProperty
  >(),
): ObjectProps => {
  const errorMessage =
    "Object schema properties must be own string-keyed data properties.";
  const prototype: unknown = globalThis.Object.getPrototypeOf(props);
  assert(
    prototype === globalThis.Object.prototype || prototype === null,
    errorMessage,
  );

  for (const key of Reflect.ownKeys(props)) {
    const descriptor = globalThis.Object.getOwnPropertyDescriptor(props, key);
    assert(
      typeof key === "string" &&
        descriptor !== undefined &&
        "value" in descriptor,
      errorMessage,
    );
    runtimeProps[key] = descriptor.value as ObjectProperty;
  }

  return runtimeProps;
};

interface ObjectTypeNode extends TypeNode {
  readonly name: "Object";
  readonly props: ObjectProps;
  readonly record?: RecordTypeNode;
}

type ObjectValidationError<Props extends ObjectProps> =
  IsUnion<Props> extends false
    ? | ObjectPropertyKeyValidationError<keyof Props>
      | {
          readonly [Key in keyof Props]: ObjectPropertyValidationError<
            Props[Key]
          >;
        }[keyof Props]
    : ObjectPropsTypeError;

type ObjectRecordValidationError<
  Props extends ObjectProps,
  Rest extends RecordTypeNode & ConcreteTypeNode,
> =
  IsUnion<Rest> extends false
    ? Rest["key"] extends typeof String
      ? typeof String extends Rest["key"]
        ? [ObjectPropertyInputs<Props>] extends [Rest["value"]["Input"]]
          ? [ObjectPropertyOutputs<Props>] extends [Rest["value"]["Output"]]
            ? never
            : ObjectRecordOutputTypeError
          : ObjectRecordInputTypeError
        : ObjectRecordKeyTypeError
      : ObjectRecordKeyTypeError
    : ObjectRecordTypeError;

type ObjectPropertyValidationError<Property extends ObjectProperty> =
  IsUnion<Property> extends false
    ? Property extends OptionalProperty<infer T extends TypeNode>
      ? ObjectPropertyTypeValidationError<T>
      : Property extends TypeNode
        ? ObjectPropertyTypeValidationError<Property>
        : ObjectPropertyTypeError
    : ObjectPropertyTypeError;

type ObjectPropertyTypeValidationError<T extends TypeNode> =
  IsUnion<T> extends false
    ? T extends ConcreteTypeNode
      ? [
          Extract<
            | "ObjectMissingProperty"
            | "ObjectPropertyAccess"
            | "ObjectExcessProperty",
            InferErrors<T>["type"]
          >,
        ] extends [never]
        ? never
        : CompileTimeError<
            "Type",
            "Property Type must not use an error tag reserved for Object structure."
          >
      : ObjectPropertyTypeError
    : ObjectPropertyTypeError;

type ObjectPropertyKeyValidationError<Key> = [Key] extends [string]
  ? string extends Key
    ? ObjectPropertyKeyError
    : "__proto__" extends Key
      ? CompileTimeError<
          "Type",
          'Object property "__proto__" is not supported.'
        >
      : DynamicObjectPropertyKey<Key>
  : ObjectPropertyKeyError;

type DynamicObjectPropertyKey<Key> = [Key] extends [string]
  ? [Key] extends [RequiredObjectPropertyKeys<Readonly<Record<Key, never>>>]
    ? never
    : ObjectPropertyKeyError
  : ObjectPropertyKeyError;

type RequiredObjectPropertyKeys<T> = {
  readonly [Key in keyof T]-?: {} extends Pick<T, Key> ? never : Key;
}[keyof T];

type ObjectPropertyTypeError = CompileTimeError<
  "Type",
  "Property must use one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
>;

type ObjectPropsTypeError = CompileTimeError<
  "Type",
  "Properties must use one concrete Object schema."
>;

type ObjectPropertyKeyError = CompileTimeError<
  "Type",
  "Object properties must use a fixed set of string keys. Use a Record Type for dynamic keys."
>;

type ObjectRecordTypeError = CompileTimeError<
  "Type",
  "The second argument must use one concrete Record Type node."
>;

type ObjectRecordKeyTypeError = CompileTimeError<
  "Type",
  "Object Record key must use the predefined String Type."
>;

type ObjectRecordInputTypeError = CompileTimeError<
  "Type",
  "Every declared property Type Input must extend the Object Record value Type Input."
>;

type ObjectRecordOutputTypeError = CompileTimeError<
  "Type",
  "Every declared property Type Output must extend the Object Record value Type Output."
>;

export type ObjectType<
  Props extends ObjectProps,
  Rest extends ObjectRecordTypeNode | undefined = undefined,
> = Rest extends ObjectRecordTypeNode
  ? ObjectWithRecordType<Props, Rest>
  : StrictObjectType<Props>;

// `fromUnknown` can report Object root errors plus declared-property child,
// missing, access, and excess/Record-rest errors. When Object has a parent, its
// own `Error` contains only the child and rest errors remaining after that
// parent validated the Object structure.
type StrictObjectType<Props extends ObjectProps> = Type<
  "Object",
  StrictObjectShape<Props, "Input">,
  StrictObjectShape<Props, "Output">,
  [StrictObjectParents<Props>] extends [null]
    ? StrictObjectFromUnknownError<StrictObjectFromUnknownPropertyErrors<Props>>
    : ObjectFromParentError<ObjectFromParentPropertyErrors<Props>>,
  [StrictObjectParents<Props>] extends [null]
    ? null
    : StrictRootObjectType<RootObjectProps<Props>>,
  StrictObjectFromUnknownError<StrictObjectFromUnknownPropertyErrors<Props>>
> & { readonly props: Readonly<Props> };

type ObjectWithRecordType<
  Props extends ObjectProps,
  Rest extends ObjectRecordTypeNode,
> = Type<
  "Object",
  ObjectWithRecordShape<Props, Rest, "Input">,
  ObjectWithRecordShape<Props, Rest, "Output">,
  [ObjectWithRecordParents<Props, Rest>] extends [null]
    ? ObjectError<ObjectDeclaredErrors<Props>, ObjectRestFromUnknownError<Rest>>
    : ObjectPropertiesError<
        ObjectFromParentPropertyErrors<Props>,
        ObjectRestFromParentError<Rest>
      >,
  [ObjectWithRecordParents<Props, Rest>] extends [null]
    ? null
    : RootObjectWithRecordType<RootObjectProps<Props>, RootObjectRecord<Rest>>,
  ObjectError<ObjectDeclaredErrors<Props>, ObjectRestFromUnknownError<Rest>>
> &
  ObjectWithRecordReflection<Props, Rest>;

type StrictObjectShape<
  Props extends ObjectProps,
  Field extends "Input" | "Output",
> = keyof Props extends never
  ? Readonly<Record<string, never>>
  : {
      readonly [Key in RequiredObjectKeys<Props>]: ObjectPropertyType<
        Props[Key]
      >[Field];
    } & {
      readonly [Key in OptionalObjectKeys<Props>]?: ObjectPropertyType<
        Props[Key]
      >[Field];
    };

type ObjectWithRecordShape<
  Props extends ObjectProps,
  Rest extends ObjectRecordTypeNode,
  Field extends "Input" | "Output",
> = keyof Props extends never
  ? ObjectRestShape<Rest, Field>
  : ObjectDeclaredShape<Props, Field> & ObjectRestShape<Rest, Field>;

type ObjectDeclaredShape<
  Props extends ObjectProps,
  Field extends "Input" | "Output",
> = Simplify<
  {
    readonly [Key in RequiredObjectKeys<Props>]: ObjectPropertyType<
      Props[Key]
    >[Field];
  } & {
    readonly [Key in OptionalObjectKeys<Props>]?: ObjectPropertyType<
      Props[Key]
    >[Field];
  }
>;

type ObjectRestShape<
  Rest extends ObjectRecordTypeNode,
  Field extends "Input" | "Output",
> = Readonly<Partial<Record<string, Rest["value"][Field]>>>;

type RequiredObjectKeys<Props extends ObjectProps> = Exclude<
  keyof Props,
  OptionalObjectKeys<Props>
>;

type OptionalObjectKeys<Props extends ObjectProps> = {
  readonly [Key in keyof Props]: Props[Key] extends OptionalProperty<TypeNode>
    ? Key
    : never;
}[keyof Props];

type ObjectPropertyType<Property extends ObjectProperty> =
  Property extends OptionalProperty<infer T> ? T : Property;

type ObjectPropertyInputs<Props extends ObjectProps> = ObjectPropertyType<
  Props[keyof Props]
>["Input"];

type ObjectPropertyOutputs<Props extends ObjectProps> = ObjectPropertyType<
  Props[keyof Props]
>["Output"];

type ObjectFromParentPropertyErrors<Props extends ObjectProps> = {
  readonly [Key in keyof Props]: TypeFromError<ObjectPropertyType<Props[Key]>>;
};

type StrictRootObjectType<Props extends ObjectProps> = Type<
  "Object",
  StrictObjectShape<Props, "Input">,
  StrictObjectShape<Props, "Output">,
  StrictObjectFromUnknownError<StrictObjectFromUnknownPropertyErrors<Props>>
> & { readonly props: Readonly<Props> };

type RootObjectWithRecordType<
  Props extends ObjectProps,
  Rest extends ObjectRecordTypeNode,
> = Type<
  "Object",
  ObjectWithRecordShape<Props, Rest, "Input">,
  ObjectWithRecordShape<Props, Rest, "Output">,
  ObjectError<ObjectDeclaredErrors<Props>, ObjectRestFromUnknownError<Rest>>
> &
  ObjectWithRecordReflection<Props, Rest>;

type StrictObjectParents<Props extends ObjectProps> = ObjectPropertyType<
  Props[keyof Props]
>["parent"];

type ObjectWithRecordParents<
  Props extends ObjectProps,
  Rest extends ObjectRecordTypeNode,
> = ObjectPropertyType<Props[keyof Props]>["parent"] | Rest["parent"];

type RootObjectProps<Props extends ObjectProps> = {
  readonly [Key in keyof Props]: Props[Key] extends OptionalProperty<infer T>
    ? OptionalProperty<RootType<T>>
    : Props[Key] extends TypeNode
      ? RootType<Props[Key]>
      : never;
};

type RootObjectRecord<Rest extends ObjectRecordTypeNode> = RecordType<
  typeof String,
  RootType<Rest["value"]>
>;

interface ObjectWithRecordReflection<
  Props extends ObjectProps,
  Rest extends ObjectRecordTypeNode,
> {
  readonly props: Readonly<Props>;
  readonly record: Rest;
}

type ObjectDeclaredErrors<Props extends ObjectProps> = {
  readonly [Key in RequiredObjectKeys<Props>]: Props[Key][typeof errorsSymbol];
} & {
  readonly [Key in OptionalObjectKeys<Props>]?: Props[Key][typeof errorsSymbol];
};

type StrictObjectFromUnknownPropertyErrors<Props extends ObjectProps> = {
  readonly [Key in RequiredObjectKeys<Props>]:
    | Props[Key][typeof errorsSymbol]
    | ObjectMissingPropertyError
    | ObjectPropertyAccessError;
} & {
  readonly [Key in OptionalObjectKeys<Props>]:
    Props[Key][typeof errorsSymbol] | ObjectPropertyAccessError;
};

/**
 * An error returned when a required {@link object} property is absent.
 *
 * `ObjectMissingProperty` is reserved for absent required properties. Property
 * {@link Type | Types} must use another error tag.
 */
export interface ObjectMissingPropertyError extends TypeError<"ObjectMissingProperty"> {}

/**
 * An error returned when a present {@link object} property is not represented as
 * an enumerable data property.
 *
 * `ObjectPropertyAccess` is reserved for this structural failure. Property
 * {@link Type | Types} must use another error tag.
 */
export interface ObjectPropertyAccessError extends TypeError<"ObjectPropertyAccess"> {
  readonly reason: "Accessor" | "NonEnumerable";
}

/** An error returned when an {@link object} input is not an object. */
export interface ObjectNotObjectError extends TypeError<"Object"> {
  readonly reason: {
    readonly kind: "NotObject";
    readonly value: unknown;
  };
}

/** An error returned when an {@link object} input has an unexpected prototype. */
export interface ObjectUnexpectedPrototypeError extends TypeError<"Object"> {
  readonly reason: {
    readonly kind: "UnexpectedPrototype";
    readonly value: object;
  };
}

/**
 * An error returned for an input property not declared by an {@link object}
 * schema.
 *
 * The property key locates this error in the containing Object error map.
 * `ObjectExcessProperty` is reserved for this structural failure. Property
 * {@link Type | Types} must use another error tag.
 */
export interface ObjectExcessPropertyError extends TypeError<"ObjectExcessProperty"> {}

/**
 * An error returned while validating an {@link object} and its properties.
 *
 * Declare required properties as required keys and optional properties as
 * optional keys. Object adds its structural property errors automatically, so
 * each value is only the error returned by that property's Type. The interface
 * can be extended by recursive error declarations.
 */
export interface ObjectError<
  Errors extends {
    readonly [Key in keyof Errors]: TypeError | undefined;
  } = Readonly<Record<string, TypeError>>,
  RestError extends TypeError = ObjectExcessPropertyError,
> extends TypeError<"Object"> {
  readonly reason:
    | ObjectNotObjectError["reason"]
    | ObjectUnexpectedPrototypeError["reason"]
    | ObjectPropertiesError<
        ObjectStructuralPropertyErrors<Errors>,
        RestError
      >["reason"];
}

/** An error returned while validating the properties of an {@link object}. */
export interface ObjectPropertiesError<
  Errors extends {
    readonly [Key in keyof Errors]: TypeError | undefined;
  },
  RestError extends TypeError = never,
> extends TypeError<"Object"> {
  readonly reason: {
    readonly kind: "Properties";
    readonly errors: Partial<Errors> &
      ([RestError] extends [never]
        ? unknown
        : ObjectUnknownPropertyErrors<
            Exclude<Errors[keyof Errors], undefined>,
            RestError
          >);
  };
}

// Object factories already know their structural property errors. Keeping that
// expanded map private avoids remapping it through the public ObjectError.
// Changes are measured by `pnpm bench:type`.
interface StrictObjectFromUnknownError<
  Errors extends {
    readonly [Key in keyof Errors]: TypeError;
  },
> extends TypeError<"Object"> {
  readonly reason:
    | ObjectNotObjectError["reason"]
    | ObjectUnexpectedPrototypeError["reason"]
    | ObjectPropertiesError<Errors, ObjectExcessPropertyError>["reason"];
}

type ObjectStructuralPropertyErrors<
  Errors extends {
    readonly [Key in keyof Errors]: TypeError | undefined;
  },
> = {
  readonly [Key in keyof Errors]-?:
    | Exclude<Errors[Key], undefined>
    | ObjectPropertyAccessError
    | ({} extends Pick<Errors, Key> ? never : ObjectMissingPropertyError);
};

type ObjectFromParentError<
  Errors extends {
    readonly [Key in keyof Errors]: TypeError;
  },
> = [Errors[keyof Errors]] extends [never]
  ? never
  : ObjectPropertiesError<Errors>;

type ObjectUnknownPropertyErrors<
  Error extends TypeError,
  RestError extends TypeError,
> = Readonly<Record<PropertyKey, Error | RestError | undefined>>;

type ObjectRestFromUnknownError<Rest extends ObjectRecordTypeNode | undefined> =
  Rest extends ObjectRecordTypeNode
    ? | ObjectPropertyAccessError
      // String key validation is fallible, so this cannot reduce to `never`.
      | RecordEntriesErrorValue<
          TypeOfError<"String">,
          InferErrors<Rest["value"]>,
          never
        >
    : ObjectExcessPropertyError;

type ObjectRestFromParentError<Rest extends ObjectRecordTypeNode | undefined> =
  Rest extends ObjectRecordTypeNode
    ? RecordEntriesError<never, TypeFromError<Rest["value"]>, never>
    : never;

type RuntimeObjectProperty =
  RuntimeTypeNode | OptionalProperty<RuntimeTypeNode>;

const isOptionalProperty = (
  property: RuntimeObjectProperty,
): property is OptionalProperty<RuntimeTypeNode> =>
  optionalPropertySymbol in property;

const objectPropertyToType = (
  property: RuntimeObjectProperty,
): RuntimeTypeNode => (isOptionalProperty(property) ? property.type : property);

interface RuntimeObjectPropertyErrors {
  [key: string]: TypeError;
  [key: symbol]: TypeError;
}

const createRecordPropertyError = <Error extends TypeError>(
  issue: RecordKeyIssue<Error> | RecordValueIssue<Error>,
): RecordEntriesErrorValue<Error, Error, never> => ({
  type: "Record",
  reason: { kind: "Entries", issues: [issue] },
});

/**
 * Tagged {@link ObjectType}.
 *
 * The discriminator belongs to `typed`, so additional properties cannot declare
 * `type`. The discriminator Input is `string`, inherited from {@link String},
 * while its Output is the exact tag. Without a third argument, additional
 * properties are rejected. Pass a {@link record} with the predefined `String`
 * key Type as the third argument to validate and preserve additional
 * string-keyed properties, just like {@link object}.
 *
 * ### Example
 *
 * ```ts
 * import { String, discriminatedUnion, typed } from "@evolu/common";
 *
 * const Pending = typed("Pending", {
 *   label: String,
 * });
 *
 * const Completed = typed("Completed");
 * const Status = discriminatedUnion(Pending, Completed);
 *
 * expectOk(Status.fromUnknown({ type: "Pending", label: "Waiting" }), {
 *   type: "Pending",
 *   label: "Waiting",
 * });
 * expectOk(Status.fromUnknown({ type: "Completed" }), {
 *   type: "Completed",
 * });
 * ```
 */
export function typed<const Tag extends TypeName>(
  tag: ValidateTypedTag<Tag>,
): TypedType<Tag>;
export function typed<
  const Tag extends TypeName,
  const Props extends ObjectProps,
>(
  tag: ValidateTypedTag<Tag>,
  props: Props,
  ...validation: [TypedValidationError<Props>] extends [never]
    ? []
    : [ValidationFailure<TypedValidationError<Props>>]
): TypedType<Tag, Props>;
export function typed<
  const Tag extends TypeName,
  const Props extends ObjectProps,
  const Rest extends RecordTypeNode & ConcreteTypeNode,
>(
  tag: ValidateTypedTag<Tag>,
  props: Props,
  record: Rest,
  ...validation: [
    | TypedValidationError<Props>
    | ObjectRecordValidationError<TypedProps<Tag, Props>, Rest>,
  ] extends [never]
    ? []
    : [
        ValidationFailure<
          | TypedValidationError<Props>
          | ObjectRecordValidationError<TypedProps<Tag, Props>, Rest>
        >,
      ]
): TypedType<Tag, Props, Rest extends ObjectRecordTypeNode ? Rest : never>;
export function typed(
  tag: TypeName,
  props: ObjectProps = {},
  recordType?: unknown,
): TypeNode {
  assert(
    !globalThis.Object.hasOwn(props, "type"),
    'The "type" schema property is reserved by typed.',
  );
  const typedProps = createMutableRecord<string, ObjectProperty>();
  typedProps.type = literal(tag as never);

  return createObjectType(
    snapshotObjectProps(props, typedProps),
    recordType as RuntimeRecordTypeNode | undefined,
  );
}

/** A structurally tagged value created by {@link typed}. */
export interface Typed<Tag extends TypeName> {
  readonly type: Tag;
}

/** The {@link ObjectType} returned by {@link typed}. */
export type TypedType<
  Tag extends TypeName,
  Props extends ObjectProps = Readonly<Record<never, never>>,
  Rest extends ObjectRecordTypeNode | undefined = undefined,
> = ObjectType<TypedProps<Tag, Props>, Rest>;

type TypedProps<Tag extends TypeName, Props extends ObjectProps> = {
  readonly type: LiteralType<Tag>;
} & Props;

type ValidateTypedTag<Tag extends TypeName> =
  IsUnion<Tag> extends false
    ? {} extends Readonly<Record<Tag, never>>
      ? ConcreteTypedTagError
      : Tag
    : ConcreteTypedTagError;

type ConcreteTypedTagError = CompileTimeError<
  "Type",
  "Tag must be one concrete Type name."
>;

type TypedValidationError<Props extends ObjectProps> =
  "type" extends keyof Props
    ? TypedTypePropertyError
    : ObjectValidationError<Props>;

type TypedTypePropertyError = CompileTimeError<
  "Type",
  'Additional properties must not declare the reserved "type" property.'
>;

/**
 * Discriminated Union {@link Type}.
 *
 * With no explicit key, the conventional `type` property created by
 * {@link typed} is used. Pass a key first to discriminate
 * {@link ObjectType | Object Types} using a different property.
 *
 * Every member must be an Object Type with a unique required string
 * {@link LiteralType} at the discriminator key. Unlike {@link union}, only the
 * selected member is decoded, checked, or encoded. The Discriminated Union
 * Input therefore narrows each member's discriminator from its widened string
 * Input to the exact literal that selects that member. Use `fromUnknown` when a
 * value does not yet have that correlated Input type.
 *
 * ### Example
 *
 * ```ts
 * import { String, discriminatedUnion, typed } from "@evolu/common";
 *
 * const Created = typed("Created", { id: String });
 * const Deleted = typed("Deleted", { id: String });
 * const Event = discriminatedUnion(Created, Deleted);
 *
 * expectOk(Event.fromUnknown({ type: "Created", id: "id" }), {
 *   type: "Created",
 *   id: "id",
 * });
 * ```
 */
export function discriminatedUnion<
  const Members extends DiscriminatedUnionMembers,
>(
  ...members: Members & DiscriminatedUnionValidation<"type", Members>
): DiscriminatedUnionType<"type", Members>;
export function discriminatedUnion<
  const Key extends string,
  const Members extends DiscriminatedUnionMembers,
>(
  key: ValidateDiscriminatedUnionKey<Key>,
  ...members: Members & DiscriminatedUnionValidation<Key, Members>
): DiscriminatedUnionType<Key, Members>;
export function discriminatedUnion(
  ...keyOrMembers: ReadonlyArray<string | ObjectTypeNode>
): TypeNode {
  const hasExplicitKey = typeof keyOrMembers[0] === "string";
  const key = hasExplicitKey ? (keyOrMembers[0] as string) : "type";
  const members = (
    hasExplicitKey ? keyOrMembers.slice(1) : keyOrMembers
  ) as ReadonlyArray<RuntimeDiscriminatedUnionMember>;
  const expected: Array<string> = [];
  const membersByDiscriminator = new Map<
    string,
    RuntimeDiscriminatedUnionMember
  >();

  for (const member of members) {
    const value = (member.props[key] as LiteralType<string>).expected;
    expected.push(value);
    membersByDiscriminator.set(value, member);
  }

  const routeUnknown = (
    value: unknown,
  ): Result<RuntimeDiscriminatedUnionMember, DiscriminatedUnionError> => {
    const objectResult: Result<
      Readonly<Record<string, unknown>>,
      ObjectNotObjectError | ObjectUnexpectedPrototypeError
    > = value === null || typeof value !== "object"
      ? err({ type: "Object", reason: { kind: "NotObject", value } })
      : !hasPlainObjectPrototype(value)
        ? err({
            type: "Object",
            reason: { kind: "UnexpectedPrototype", value },
          })
        : ok(value as Readonly<Record<string, unknown>>);

    if (!objectResult.ok) {
      return err({
        type: "DiscriminatedUnion",
        reason: { kind: "Object", error: objectResult.error },
      });
    }

    const input = objectResult.value;
    const descriptor = globalThis.Object.getOwnPropertyDescriptor(input, key);
    let discriminator: unknown;

    if (descriptor === undefined) {
      if (key in input) {
        return err({
          type: "DiscriminatedUnion",
          reason: { kind: "PropertyAccess", key, reason: "Inherited" },
        } satisfies DiscriminatedUnionPropertyAccessError<string>);
      }
      discriminator = undefined;
    } else if (!("value" in descriptor)) {
      return err({
        type: "DiscriminatedUnion",
        reason: { kind: "PropertyAccess", key, reason: "Accessor" },
      } satisfies DiscriminatedUnionPropertyAccessError<string>);
    } else if (!descriptor.enumerable) {
      return err({
        type: "DiscriminatedUnion",
        reason: { kind: "PropertyAccess", key, reason: "NonEnumerable" },
      } satisfies DiscriminatedUnionPropertyAccessError<string>);
    } else {
      discriminator = descriptor.value;
    }
    const member =
      typeof discriminator === "string"
        ? membersByDiscriminator.get(discriminator)
        : undefined;

    if (member === undefined) {
      return err({
        type: "DiscriminatedUnion",
        reason: {
          kind: "Discriminator",
          key,
          value: discriminator,
          expected,
        },
      });
    }

    return ok(member);
  };
  const wrapMemberResult = (
    member: RuntimeDiscriminatedUnionMember,
    result: Result<unknown, TypeError>,
  ): Result<unknown, DiscriminatedUnionMemberError> =>
    result.ok
      ? result
      : err({
          type: "DiscriminatedUnion",
          reason: {
            kind: "Member",
            discriminator: (member.props[key] as LiteralType<string>).expected,
            error: result.error,
          },
        });
  const validateUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
    useParent: boolean,
    exactOutput: boolean,
  ): Result<unknown, TypeError> => {
    const routeResult = routeUnknown(value);

    if (!routeResult.ok) return routeResult;

    const member = routeResult.value;
    const type = useParent ? member.parent : member;
    return wrapMemberResult(
      member,
      exactOutput
        ? type[outputValidationSymbol](value, options)
        : type.fromUnknown(value, options),
    );
  };
  const getOutputMember = (
    value: unknown,
  ): RuntimeDiscriminatedUnionMember | undefined => {
    if (value === null || typeof value !== "object") return undefined;
    const descriptor = globalThis.Object.getOwnPropertyDescriptor(value, key);

    return descriptor !== undefined && "value" in descriptor
      ? membersByDiscriminator.get(descriptor.value as string)
      : undefined;
  };
  const route = (value: unknown): RuntimeDiscriminatedUnionMember =>
    membersByDiscriminator.get(
      Reflect.get(value as Readonly<Record<string, unknown>>, key) as string,
    )!;
  const formatError: TypeErrorFormatter<DiscriminatedUnionError> = (error) => {
    const reason = error.reason as Exclude<
      DiscriminatedUnionError["reason"],
      DiscriminatedUnionMemberIssue
    >;

    switch (reason.kind) {
      case "Object":
        return formatPlainObjectRootError(reason.error.reason);
      case "PropertyAccess": {
        const property = `The discriminator property ${safelyStringifyUnknownValue(reason.key)}`;
        if (reason.reason === "Accessor") {
          return `${property} must be a data property.`;
        }
        if (reason.reason === "Inherited") {
          return `${property} must be an own property.`;
        }
        return `${property} must be enumerable.`;
      }
      case "Discriminator":
        return `The discriminator property ${safelyStringifyUnknownValue(reason.key)} has an unexpected value ${safelyStringifyUnknownValue(reason.value)}.`;
    }
  };
  const defaultFormatter = formatError as TypeErrorFormatter<TypeError>;
  const getTypeIssues: RuntimeGetTypeIssues = (error, mode) => {
    const discriminatedUnionError = error as DiscriminatedUnionError;

    if (discriminatedUnionError.reason.kind === "Member") {
      const reason = discriminatedUnionError.reason;
      const member = membersByDiscriminator.get(reason.discriminator);
      assertNonNullable(member);

      return member[getRuntimeTypeIssuesSymbol](reason.error, mode);
    }
    if (
      discriminatedUnionError.reason.kind === "PropertyAccess" ||
      discriminatedUnionError.reason.kind === "Discriminator"
    ) {
      return singleRuntimeTypeIssue(
        "DiscriminatedUnion",
        discriminatedUnionError,
        defaultFormatter,
        [discriminatedUnionError.reason.key],
      );
    }

    return singleRuntimeTypeIssue(
      "DiscriminatedUnion",
      error,
      defaultFormatter,
    );
  };
  const parentFromUnknown = (value: unknown, options?: ValidationOptions) =>
    validateUnknown(value, options, true, false);
  const parentValidateOutput = (value: unknown, options?: ValidationOptions) =>
    validateUnknown(value, options, true, true);
  const parentTo: RuntimeEncoder = (value: never) =>
    (route(value).parent as RuntimeTypeNode)[encoderSymbol](value);
  const parent = createTypeNode<
    DiscriminatedUnionInputType<unknown, DiscriminatedUnionError>
  >(
    "DiscriminatedUnion",
    null,
    parentFromUnknown,
    (value) => getOutputMember(value)?.parent.is(value) ?? false,
    parentValidateOutput,
    ok,
    parentTo,
    getTypeIssues,
    { key, members },
  );
  const fromUnknown = (value: unknown, options?: ValidationOptions) =>
    validateUnknown(value, options, false, false);
  const validateOutput = (value: unknown, options?: ValidationOptions) =>
    validateUnknown(value, options, false, true);
  const fromParent: RuntimeOperation<Result<unknown, TypeError>> = (
    value: never,
    options: ValidationOptions = firstValidationOptions,
  ) => {
    const member = route(value);
    const result = member[fromSymbol].parent!(value, options);
    return wrapMemberResult(member, result);
  };
  const from = createFromOperation(fromParent);
  const to: RuntimeEncoder = (value: never) =>
    route(value)[encoderSymbol](value);

  return createTypeNode(
    "DiscriminatedUnion",
    parent,
    fromUnknown,
    (value) => getOutputMember(value)?.is(value) ?? false,
    validateOutput,
    from,
    to,
    getTypeIssues,
    { key, members },
  );
}

/** The routed {@link Type} returned by {@link discriminatedUnion}. */
export interface DiscriminatedUnionType<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> extends Type<
  "DiscriminatedUnion",
  DiscriminatedUnionInput<Key, Members>,
  Members[number]["Output"],
  DiscriminatedUnionNodeError<Key, Members>,
  DiscriminatedUnionInputType<
    DiscriminatedUnionInput<Key, Members>,
    DiscriminatedUnionParentError<Key, Members>
  >,
  DiscriminatedUnionCompleteError<Key, Members>
> {
  readonly key: Key;
  readonly members: Members;
}

/** A root {@link Type} validating Inputs accepted by {@link discriminatedUnion}. */
export type DiscriminatedUnionInputType<Input, Error extends TypeError> = Type<
  "DiscriminatedUnion",
  Input,
  Input,
  Error
>;

/** An error returned while selecting a member in {@link discriminatedUnion}. */
export type DiscriminatedUnionError<
  Key extends string = string,
  Expected extends string = string,
  MemberIssue extends DiscriminatedUnionMemberIssue =
    DiscriminatedUnionMemberIssue<Expected>,
> =
  | DiscriminatedUnionObjectError
  | DiscriminatedUnionPropertyAccessError<Key>
  | DiscriminatedUnionDiscriminatorError<Key, Expected>
  | DiscriminatedUnionMemberError<MemberIssue>;

/** An error returned when a value cannot be routed through {@link Object}. */
export interface DiscriminatedUnionObjectError extends TypeError<"DiscriminatedUnion"> {
  readonly reason: {
    readonly kind: "Object";
    readonly error: ObjectNotObjectError | ObjectUnexpectedPrototypeError;
  };
}

/**
 * An error returned when the discriminator for {@link discriminatedUnion} is not
 * an own enumerable data property.
 */
export interface DiscriminatedUnionPropertyAccessError<
  Key extends string = string,
> extends TypeError<"DiscriminatedUnion"> {
  readonly reason: {
    readonly kind: "PropertyAccess";
    readonly key: Key;
    readonly reason: "Accessor" | "Inherited" | "NonEnumerable";
  };
}

/** An error returned when no member of {@link discriminatedUnion} matches. */
export interface DiscriminatedUnionDiscriminatorError<
  Key extends string = string,
  Expected extends string = string,
> extends TypeError<"DiscriminatedUnion"> {
  readonly reason: {
    readonly kind: "Discriminator";
    readonly key: Key;
    readonly value: unknown;
    readonly expected: ReadonlyArray<Expected>;
  };
}

/** A selected-member issue returned by {@link discriminatedUnion}. */
export interface DiscriminatedUnionMemberIssue<
  Discriminator extends string = string,
  Error extends TypeError = TypeError,
> {
  readonly kind: "Member";
  readonly discriminator: Discriminator;
  readonly error: Error;
}

/** An error returned by the member selected by {@link discriminatedUnion}. */
export type DiscriminatedUnionMemberError<
  Issue extends DiscriminatedUnionMemberIssue = DiscriminatedUnionMemberIssue,
> = [Issue] extends [never]
  ? never
  : TypeError<"DiscriminatedUnion"> & { readonly reason: Issue };

type DiscriminatedUnionObjectType = ObjectTypeNode & ConcreteTypeNode;

type DiscriminatedUnionMembers =
  AtLeastTwoReadonlyArray<DiscriminatedUnionObjectType>;

type DiscriminatedUnionInput<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = DiscriminatedUnionMemberInput<Key, Members[number]>;

type DiscriminatedUnionMemberInput<
  Key extends string,
  Member extends DiscriminatedUnionObjectType,
> = Member extends DiscriminatedUnionObjectType
  ? Member["Input"] & Readonly<Record<Key, DiscriminatorValue<Key, Member>>>
  : never;

type DiscriminatorValue<
  Key extends string,
  Member extends DiscriminatedUnionObjectType,
> = Key extends keyof Member["props"]
  ? Member["props"][Key] extends LiteralType<infer Expected extends string>
    ? Expected
    : never
  : never;

// Per-member paths already distribute their member union. Distribute here only
// when an aggregate error needs the complete discriminator union.
type DiscriminatorValueUnion<
  Key extends string,
  Member extends DiscriminatedUnionObjectType,
> = Member extends DiscriminatedUnionObjectType
  ? DiscriminatorValue<Key, Member>
  : never;

type DiscriminatedUnionNodeError<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = DiscriminatedUnionMemberError<
  CorrelatedDiscriminatedUnionNodeIssue<Key, Members>
>;

type DiscriminatedUnionParentError<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = DiscriminatedUnionError<
  Key,
  DiscriminatorValueUnion<Key, Members[number]>,
  CorrelatedDiscriminatedUnionRootIssue<Key, Members>
>;

type DiscriminatedUnionCompleteError<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = DiscriminatedUnionError<
  Key,
  DiscriminatorValueUnion<Key, Members[number]>,
  CorrelatedDiscriminatedUnionCompleteIssue<Key, Members>
>;

type CorrelatedDiscriminatedUnionNodeIssue<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = CorrelatedDiscriminatedUnionNodeIssueFor<Key, Members[number]>;

type CorrelatedDiscriminatedUnionNodeIssueFor<
  Key extends string,
  Member extends DiscriminatedUnionObjectType,
> = Member extends DiscriminatedUnionObjectType
  ? DiscriminatedUnionMemberIssue<
      DiscriminatorValue<Key, Member>,
      Member extends {
        readonly parent: TypeNode & { readonly parent: null };
      }
        ? Member["Error"]
        : TypeFromError<Member>
    >
  : never;

type CorrelatedDiscriminatedUnionRootIssue<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = CorrelatedDiscriminatedUnionRootIssueFor<Key, Members[number]>;

type CorrelatedDiscriminatedUnionRootIssueFor<
  Key extends string,
  Member extends DiscriminatedUnionObjectType,
> = Member extends DiscriminatedUnionObjectType
  ? DiscriminatedUnionMemberIssue<
      DiscriminatorValue<Key, Member>,
      Member extends {
        readonly parent: infer Parent extends TypeNode & {
          readonly parent: null;
        };
      }
        ? InferErrors<Parent>
        : InferErrors<RootType<Member>>
    >
  : never;

type CorrelatedDiscriminatedUnionCompleteIssue<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = CorrelatedDiscriminatedUnionCompleteIssueFor<Key, Members[number]>;

type CorrelatedDiscriminatedUnionCompleteIssueFor<
  Key extends string,
  Member extends DiscriminatedUnionObjectType,
> = Member extends DiscriminatedUnionObjectType
  ? DiscriminatedUnionMemberIssue<
      DiscriminatorValue<Key, Member>,
      InferErrors<Member>
    >
  : never;

type ValidateDiscriminatedUnionKey<Key extends string> =
  IsUnion<Key> extends false
    ? {} extends Readonly<Record<Key, never>>
      ? DiscriminatedUnionKeyError
      : Key
    : DiscriminatedUnionKeyError;

type DiscriminatedUnionValidation<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = [ValidateDiscriminatedUnionMembers<Key, Members>] extends [never]
  ? unknown
  : readonly [
      ValidationFailure<ValidateDiscriminatedUnionMembers<Key, Members>>,
    ];

type ValidateDiscriminatedUnionMembers<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = number extends Members["length"]
  ? DiscriminatedUnionMembersTupleError
  : IsUnion<Members["length"]> extends false
    ? | {
          readonly [Index in keyof Members & `${number}`]: IsUnion<
            Members[Index]
          > extends false
            ? [DiscriminatorValue<Key, Members[Index]>] extends [never]
              ? DiscriminatedUnionPropertyError<Key>
              : never
            : DiscriminatedUnionMemberConcreteTypeError;
        }[keyof Members & `${number}`]
      | ValidateUniqueDiscriminatorValues<
          Key,
          DiscriminatedUnionValues<Key, Members>
        >
    : DiscriminatedUnionMembersTupleError;

type DiscriminatedUnionValues<
  Key extends string,
  Members extends DiscriminatedUnionMembers,
> = {
  readonly [Index in keyof Members]: DiscriminatorValue<Key, Members[Index]>;
};

type ValidateUniqueDiscriminatorValues<
  Key extends string,
  Values extends ReadonlyArray<string>,
  Seen extends string = never,
> = Values extends readonly [
  infer Expected extends string,
  ...infer Rest extends ReadonlyArray<string>,
]
  ? Expected extends Seen
    ? DiscriminatedUnionDuplicateValueError<Key, Expected>
    : ValidateUniqueDiscriminatorValues<Key, Rest, Seen | Expected>
  : never;

type DiscriminatedUnionKeyError = CompileTimeError<
  "Type",
  "Discriminator key must be one concrete string literal."
>;

type DiscriminatedUnionMembersTupleError = CompileTimeError<
  "Type",
  "Members must use one concrete finite tuple of Object Types."
>;

type DiscriminatedUnionMemberConcreteTypeError = CompileTimeError<
  "Type",
  "Member must use one concrete Object Type node."
>;

type DiscriminatedUnionPropertyError<Key extends string> = CompileTimeError<
  "Type",
  `Property "${Key}" must be a required string Literal Type in every member.`
>;

type DiscriminatedUnionDuplicateValueError<
  Key extends string,
  Expected extends string,
> = CompileTimeError<
  "Type",
  `Duplicate value "${Expected}" at property "${Key}".`
>;

type RuntimeObjectTypeNode = ObjectTypeNode & RuntimeTypeNode;

type RuntimeDiscriminatedUnionMember = RuntimeObjectTypeNode & {
  // A required Literal discriminator makes Object create one immediate,
  // terminal parent containing the encoded roots of every property and its
  // optional Record. That parent is the member's encoded boundary.
  readonly parent: RuntimeObjectTypeNode & { readonly parent: null };
};

/**
 * Lazy {@link Type} for recursive definitions.
 *
 * Lazy defers and caches a Type definition, allowing recursive data such as
 * trees and mutually recursive models.
 *
 * A recursive declaration refers to its own variable while that variable is
 * being initialized, so TypeScript cannot infer it reliably. Getter-based
 * inference tricks are brittle once optional properties, unions, or mutually
 * recursive definitions are involved. Declare recursive data interfaces and
 * structured error types explicitly for stable inference and clearer compiler
 * errors.
 *
 * The definition must return one concrete non-Lazy Type. Use {@link union} for
 * alternatives. Every recursive Lazy reference must be nested behind an
 * {@link object}, {@link array}, {@link tuple}, or {@link record} structural
 * boundary. Union does not guard recursion because it passes the same value to
 * every member. Lazy defers schema construction; it does not make cyclic
 * runtime object graphs or arbitrarily deep values stack-safe.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   Number,
 *   String,
 *   array,
 *   lazy,
 *   object,
 *   optional,
 *   type ArrayError,
 *   type LazyType,
 *   type ObjectError,
 *   type TypeOfError,
 * } from "@evolu/common";
 *
 * interface Tree {
 *   readonly value: string;
 *   readonly children: ReadonlyArray<Tree>;
 * }
 *
 * interface TreeError extends ObjectError<{
 *   readonly value: TypeOfError<"String">;
 *   readonly children: ArrayError<TreeError>;
 * }> {}
 *
 * const Tree: LazyType<Tree, Tree, never, TreeError, TreeError> = lazy(
 *   () => object({ value: String, children: array(Tree) }),
 * );
 *
 * interface Left {
 *   readonly label: string;
 *   readonly right?: Right;
 * }
 *
 * interface Right {
 *   readonly count: number;
 *   readonly left?: Left;
 * }
 *
 * interface LeftError extends ObjectError<{
 *   readonly label: TypeOfError<"String">;
 *   readonly right?: RightError;
 * }> {}
 *
 * interface RightError extends ObjectError<{
 *   readonly count: TypeOfError<"Number">;
 *   readonly left?: LeftError;
 * }> {}
 *
 * const Left: LazyType<Left, Left, never, LeftError, LeftError> = lazy(
 *   () => object({ label: String, right: optional(Right) }),
 * );
 *
 * const Right: LazyType<Right, Right, never, RightError, RightError> =
 *   lazy(() => object({ count: Number, left: optional(Left) }));
 * ```
 */
export function lazy<Target extends ConcreteTypeNode>(
  getType: Thunk<ValidateLazyTarget<Target>>,
): LazyType<
  Target["Input"],
  Target["Output"],
  TypeFromError<Target>,
  InferErrors<RootType<Target>>,
  InferErrors<Target>
>;
export function lazy(getType: Thunk<TypeNode>): TypeNode {
  let resolution: LazyResolution = { state: "unresolved" };

  const resolve = (): ResolvedLazyType => {
    switch (resolution.state) {
      case "resolved":
        return resolution;
      case "failed":
        throw resolution.error;
      case "resolving":
        assert(
          false,
          "A Lazy Type definition must not resolve itself while it is being created.",
        );
      // eslint-disable-next-line no-fallthrough
      case "unresolved": {
        resolution = { state: "resolving" };

        try {
          const target = getType() as RuntimeTypeNode;
          assert(
            !lazyTypeNodes.has(target),
            "A Lazy Type definition must return a non-Lazy Type.",
          );
          let root = target;

          while (root.parent) {
            root = root.parent as RuntimeTypeNode;
            assert(
              !lazyTypeNodes.has(root),
              "A Lazy Type definition must not use a Lazy Type in its parent chain.",
            );
          }
          const resolved: ResolvedLazyType = {
            state: "resolved",
            target,
            targetFromInput: getTerminalRuntimeNode(target[fromSymbol]),
            root,
          };
          resolution = resolved;
          return resolved;
        } catch (error) {
          resolution = { state: "failed", error };
          throw error;
        }
      }
    }
  };
  const parentFromUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => resolve().root.fromUnknown(value, options);
  const parentTo: RuntimeEncoder = (value: never) =>
    resolve().root[encoderSymbol](value);
  const parent = createTypeNode(
    "Lazy",
    null,
    parentFromUnknown,
    (value) => resolve().root.is(value),
    (value, options) => resolve().root[outputValidationSymbol](value, options),
    ok,
    parentTo,
    (error, mode) => resolve().root[getRuntimeTypeIssuesSymbol](error, mode),
  );
  const fromUnknown = (
    value: unknown,
    options: ValidationOptions = firstValidationOptions,
  ) => resolve().target.fromUnknown(value, options);
  const fromParent: RuntimeOperation<Result<unknown, TypeError>> = (
    value: never,
    options: ValidationOptions = firstValidationOptions,
  ) => resolve().targetFromInput(value, options);
  const from = createFromOperation(fromParent);
  const type = createTypeNode(
    "Lazy",
    parent,
    fromUnknown,
    (value) => resolve().target.is(value),
    (value, options) =>
      resolve().target[outputValidationSymbol](value, options),
    from,
    (value) => resolve().target[encoderSymbol](value),
    (error, mode) => resolve().target[getRuntimeTypeIssuesSymbol](error, mode),
  );
  lazyTypeNodes.add(parent);
  lazyTypeNodes.add(type);

  return type;
}

/**
 * A deferred {@link Type} with an explicit recursive type declaration.
 *
 * A Lazy Type exposes one terminal input parent before its definition is
 * evaluated. Its `from` operation accepts its Output, while `from.parent`
 * performs the complete conversion from Input to Output. The resolved Type's
 * intermediate parent suffixes and constructor-specific reflection are
 * intentionally not exposed.
 *
 * `FromError` describes `from.parent` failures, `InputError` describes the
 * synthetic parent's unknown-input failures, and `Errors` describes the
 * complete `fromUnknown` failures. Keeping those channels explicit makes a
 * recursive declaration finite for TypeScript while preserving structured
 * errors at every boundary.
 */
export interface LazyType<
  // Explicit invariance prevents recursive comparisons from repeatedly
  // expanding their structured Object errors. Changes are measured by `pnpm
  // bench:type`.
  in out Input,
  in out Output,
  in out FromError extends TypeError,
  in out InputError extends TypeError,
  in out Errors extends TypeError,
> extends Type<
  "Lazy",
  Input,
  Output,
  FromError,
  Type<"Lazy", Input, Input, InputError>,
  Errors
> {
  /** Formats an error returned by any Lazy Type decoding operation. */
  readonly formatError: TypeErrorFormatter<Errors | FromError>;
}

type ValidateLazyTarget<Target extends ConcreteTypeNode> =
  IsUnion<Target> extends false ? Target : LazyTargetConcreteTypeError;

type LazyTargetConcreteTypeError = CompileTimeError<
  "Type",
  "Lazy Type definition must return one concrete Type node. Pass a Union Type node instead of a union of Type nodes."
>;

type LazyResolution =
  | { readonly state: "unresolved" }
  | { readonly state: "resolving" }
  | ResolvedLazyType
  | { readonly state: "failed"; readonly error: unknown };

interface ResolvedLazyType {
  readonly state: "resolved";
  readonly target: RuntimeTypeNode;
  readonly targetFromInput: RuntimeOperation<Result<unknown, TypeError>>;
  readonly root: RuntimeTypeNode;
}

const lazyTypeNodes = /*#__PURE__*/ new WeakSet<TypeNode>();

/**
 * A candidate JSON value before exact runtime validation.
 *
 * Unlike {@link JsonValue}, numbers are not yet proven finite and TypeScript
 * cannot express runtime representation constraints or acyclicity.
 */
export type JsonValueInput =
  string | number | boolean | null | JsonArrayInput | JsonObjectInput;

/** A candidate JSON array before exact runtime validation. */
export type JsonArrayInput = ReadonlyArray<JsonValueInput>;

/** A candidate JSON object before exact runtime validation. */
export interface JsonObjectInput {
  readonly [key: string]: JsonValueInput;
}

/**
 * An exact in-memory JSON data value.
 *
 * Numbers are finite. Arrays and objects use Evolu Type's strict plain-data
 * representations, and the complete value graph is acyclic.
 */
export type JsonValue =
  string | FiniteNumber | boolean | null | JsonArray | JsonObject;

/** An exact JSON array containing only {@link JsonValue} elements. */
export type JsonArray = ReadonlyArray<JsonValue>;

/** An exact JSON object containing only {@link JsonValue} properties. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** One issue found while validating an exact {@link JsonValue}. */
export type JsonValueIssue =
  | {
      readonly kind: "InvalidType";
      readonly path: ReadonlyArray<string | number | symbol>;
      readonly value: unknown;
    }
  | {
      readonly kind: "NonFiniteNumber";
      readonly path: ReadonlyArray<string | number | symbol>;
      readonly value: number;
    }
  | {
      readonly kind: "UnexpectedPrototype";
      readonly path: ReadonlyArray<string | number | symbol>;
      readonly container: "Array" | "Object";
      readonly value: object;
    }
  | {
      readonly kind: "Accessor";
      readonly path: ReadonlyArray<string | number | symbol>;
    }
  | {
      readonly kind: "NonEnumerable";
      readonly path: ReadonlyArray<string | number | symbol>;
    }
  | {
      readonly kind: "SymbolProperty";
      readonly path: ReadonlyArray<string | number | symbol>;
    }
  | {
      readonly kind: "Hole";
      readonly path: ReadonlyArray<string | number | symbol>;
    }
  | {
      readonly kind: "ExcessProperty";
      readonly path: ReadonlyArray<string | number | symbol>;
    }
  | {
      readonly kind: "CircularReference";
      readonly path: ReadonlyArray<string | number | symbol>;
      readonly ancestorPath: ReadonlyArray<string | number | symbol>;
    };

/** An error containing one or more issues found in a {@link JsonValue}. */
export interface JsonValueError extends TypeError<"JsonValue"> {
  readonly reason: {
    readonly kind: "Issues";
    readonly issues: NonEmptyReadonlyArray<JsonValueIssue>;
  };
}

/** The exact root {@link Type} of in-memory JSON data values. */
export interface JsonValueType extends Type<
  "JsonValue",
  JsonValue,
  JsonValue,
  JsonValueError
> {}

/** The exact top-level JSON object {@link Type}. */
export interface JsonObjectType extends Type<
  "Record",
  JsonObject,
  JsonObject,
  RecordError<TypeOfError<"String">, JsonValueError, never>
> {
  readonly key: typeof String;
  readonly value: JsonValueType;
}

/** An error returned when a string does not contain valid JSON text. */
export interface JsonError extends TypeError<"Json"> {
  readonly value: string;
}

type JsonValuePathKey = string | number | symbol;

interface JsonValuePathNode {
  readonly parent: JsonValuePathNode | null;
  readonly key: JsonValuePathKey;
}

type JsonValueWork =
  | {
      readonly kind: "Value";
      readonly value: unknown;
      readonly path: JsonValuePathNode | null;
    }
  | {
      readonly kind: "Leave";
      readonly value: object;
    };

type JsonValueStringifyWork =
  | {
      readonly kind: "Value";
      readonly value: JsonValue;
    }
  | {
      readonly kind: "Text";
      readonly value: string;
    };

const emptyJsonValuePath: ReadonlyArray<JsonValuePathKey> =
  /*#__PURE__*/ globalThis.Object.freeze([]);

const jsonValuePathToArray = (
  path: JsonValuePathNode | null,
): ReadonlyArray<JsonValuePathKey> => {
  if (path === null) return emptyJsonValuePath;

  const keys: Array<JsonValuePathKey> = [];
  let node: JsonValuePathNode | null = path;

  while (node !== null) {
    keys.push(node.key);
    node = node.parent;
  }

  keys.reverse();
  return globalThis.Object.freeze(keys);
};

const jsonValueChildPath = (
  parent: JsonValuePathNode | null,
  key: JsonValuePathKey,
): JsonValuePathNode => ({ parent, key });

const validateJsonValue = (
  value: unknown,
  options: ValidationOptions = firstValidationOptions,
): Result<JsonValue, JsonValueError> => {
  const work: Array<JsonValueWork> = [{ kind: "Value", value, path: null }];
  const activePathByObject = new WeakMap<object, JsonValuePathNode | null>();
  let issues: Array<JsonValueIssue> | undefined;

  const addIssue = (issue: JsonValueIssue): boolean => {
    (issues ??= []).push(issue);
    return options.errors === "first";
  };

  while (work.length > 0) {
    const current = work.pop()!;

    if (current.kind === "Leave") {
      activePathByObject.delete(current.value);
      continue;
    }

    const { path, value } = current;

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      continue;
    }
    if (typeof value === "number") {
      if (!globalThis.Number.isFinite(value)) {
        if (
          addIssue({
            kind: "NonFiniteNumber",
            path: jsonValuePathToArray(path),
            value,
          })
        ) {
          break;
        }
      }
      continue;
    }
    if (typeof value !== "object") {
      if (
        addIssue({
          kind: "InvalidType",
          path: jsonValuePathToArray(path),
          value,
        })
      ) {
        break;
      }
      continue;
    }

    const isArray = globalThis.Array.isArray(value);
    const prototype: unknown = globalThis.Object.getPrototypeOf(value);

    if (
      isArray
        ? prototype !== globalThis.Array.prototype
        : prototype !== globalThis.Object.prototype && prototype !== null
    ) {
      if (
        addIssue({
          kind: "UnexpectedPrototype",
          path: jsonValuePathToArray(path),
          container: isArray ? "Array" : "Object",
          value,
        })
      ) {
        break;
      }
      continue;
    }

    if (activePathByObject.has(value)) {
      if (
        addIssue({
          kind: "CircularReference",
          path: jsonValuePathToArray(path),
          ancestorPath: jsonValuePathToArray(activePathByObject.get(value)!),
        })
      ) {
        break;
      }
      continue;
    }

    const children: Array<Extract<JsonValueWork, { readonly kind: "Value" }>> =
      [];

    if (isArray) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key === "string") {
          const index = globalThis.Number(key) >>> 0;
          if (index < value.length && globalThis.String(index) === key) {
            continue;
          }
        }

        if (
          addIssue({
            kind: "ExcessProperty",
            path: jsonValuePathToArray(jsonValueChildPath(path, key)),
          })
        ) {
          break;
        }
      }
      if (issues !== undefined && options.errors === "first") break;

      for (let index = 0; index < value.length; index++) {
        const childPath = jsonValueChildPath(path, index);
        const descriptor = globalThis.Object.getOwnPropertyDescriptor(
          value,
          index,
        );

        if (descriptor === undefined) {
          if (
            addIssue({
              kind: "Hole",
              path: jsonValuePathToArray(childPath),
            })
          ) {
            break;
          }
          continue;
        }
        if (!("value" in descriptor)) {
          if (
            addIssue({
              kind: "Accessor",
              path: jsonValuePathToArray(childPath),
            })
          ) {
            break;
          }
          continue;
        }

        children.push({
          kind: "Value",
          value: descriptor.value,
          path: childPath,
        });
      }
    } else {
      for (const key of Reflect.ownKeys(value)) {
        const childPath = jsonValueChildPath(path, key);

        if (typeof key === "symbol") {
          if (
            addIssue({
              kind: "SymbolProperty",
              path: jsonValuePathToArray(childPath),
            })
          ) {
            break;
          }
          continue;
        }

        const descriptor = globalThis.Object.getOwnPropertyDescriptor(
          value,
          key,
        )!;

        if (!("value" in descriptor)) {
          if (
            addIssue({
              kind: "Accessor",
              path: jsonValuePathToArray(childPath),
            })
          ) {
            break;
          }
          continue;
        }
        if (!descriptor.enumerable) {
          if (
            addIssue({
              kind: "NonEnumerable",
              path: jsonValuePathToArray(childPath),
            })
          ) {
            break;
          }
          continue;
        }

        children.push({
          kind: "Value",
          value: descriptor.value,
          path: childPath,
        });
      }
    }
    if (issues !== undefined && options.errors === "first") break;

    activePathByObject.set(value, path);
    work.push({ kind: "Leave", value });

    for (let index = children.length - 1; index >= 0; index--) {
      work.push(children[index]);
    }
  }

  return issues === undefined
    ? ok(value as JsonValue)
    : err({
        type: "JsonValue",
        reason: {
          kind: "Issues",
          issues: globalThis.Object.freeze(
            issues,
          ) as unknown as NonEmptyReadonlyArray<JsonValueIssue>,
        },
      });
};

const formatJsonValueError: TypeErrorFormatter<JsonValueError> = (error) => {
  const issue = error.reason.issues[0];

  switch (issue.kind) {
    case "InvalidType":
      return `A value ${safelyStringifyUnknownValue(issue.value)} is not a JSON value.`;
    case "NonFiniteNumber":
      return "A JSON number must be finite.";
    case "UnexpectedPrototype":
      return `The value is ${issue.container === "Array" ? "an array" : "an object"}, but a JsonValue Output must use this realm's ${issue.container}.prototype${issue.container === "Object" ? " or null" : ""}. ${boundaryRepresentationGuidance}`;
    case "Accessor":
      return "A JSON property must be a data property. Materialize accessor values into plain data before using this Type or use a different Type.";
    case "NonEnumerable":
      return "A JSON Object property must be enumerable. Remove it or use a different Type.";
    case "SymbolProperty":
      return "A JSON Object property key must be a string. Remove the symbol property or use a different Type.";
    case "Hole":
      return "A JSON Array element is missing.";
    case "ExcessProperty":
      return "An excess JSON Array property is not allowed. Remove it or use a different Type.";
    case "CircularReference":
      return "A JsonValue must not contain circular references.";
  }
};

const getJsonValueRuntimeTypeIssues: RuntimeGetTypeIssues = (error, mode) => {
  const jsonValueError = error as JsonValueError;
  const issues =
    mode === "first"
      ? ([jsonValueError.reason.issues[0]] as const)
      : jsonValueError.reason.issues;

  return issues.map((issue) => ({
    name: "JsonValue",
    error:
      mode === "first"
        ? error
        : {
            type: "JsonValue",
            reason: { kind: "Issues", issues: [issue] },
          },
    path: issue.path,
    formatError: formatJsonValueError as TypeErrorFormatter<TypeError>,
  })) as unknown as NonEmptyReadonlyArray<RuntimeTypeIssue>;
};

const validateJson = (value: string): Result<void, JsonError> => {
  const result = trySync(
    (): unknown => globalThis.JSON.parse(value) as unknown,
  );

  return result.ok && validateJsonValue(result.value).ok
    ? ok()
    : err({ type: "Json", value });
};

const parseJson = (value: string): JsonValue =>
  globalThis.JSON.parse(value) as JsonValue;

const stringifyJsonValue = (value: JsonValue): Json => {
  const chunks: Array<string> = [];
  const work: Array<JsonValueStringifyWork> = [{ kind: "Value", value }];

  while (work.length > 0) {
    const current = work.pop()!;

    if (current.kind === "Text") {
      chunks.push(current.value);
      continue;
    }

    const value = current.value;

    if (value === null) {
      chunks.push("null");
      continue;
    }

    switch (typeof value) {
      case "string":
        chunks.push(globalThis.JSON.stringify(value));
        break;
      case "number":
        chunks.push(
          globalThis.Object.is(value, -0) ? "-0" : globalThis.String(value),
        );
        break;
      case "boolean":
        chunks.push(value ? "true" : "false");
        break;
      case "object": {
        if (globalThis.Array.isArray(value)) {
          const array = value as JsonArray;
          chunks.push("[");
          work.push({ kind: "Text", value: "]" });

          for (let index = array.length - 1; index >= 0; index--) {
            work.push({ kind: "Value", value: array[index] });
            if (index > 0) work.push({ kind: "Text", value: "," });
          }
          break;
        }

        const object = value as JsonObject;
        const keys = globalThis.Object.keys(object);
        chunks.push("{");
        work.push({ kind: "Text", value: "}" });

        for (let index = keys.length - 1; index >= 0; index--) {
          const key = keys[index];
          work.push({ kind: "Value", value: object[key] });
          work.push({ kind: "Text", value: ":" });
          work.push({
            kind: "Text",
            value: globalThis.JSON.stringify(key),
          });
          if (index > 0) work.push({ kind: "Text", value: "," });
        }
        break;
      }
    }
  }

  return chunks.join("") as Json;
};

/** Exact root Type for {@link JsonValue} data trees. */
export const JsonValue: JsonValueType =
  /*#__PURE__*/ createTypeNode<JsonValueType>(
    "JsonValue",
    null,
    validateJsonValue,
    (value) => validateJsonValue(value).ok,
    validateJsonValue,
    ok,
    identity,
    getJsonValueRuntimeTypeIssues,
  );

/** Exact top-level JSON array {@link Type}. */
export const JsonArray = /*#__PURE__*/ array(JsonValue);

/** Exact top-level JSON object {@link Type}. */
export const JsonObject = /*#__PURE__*/ record(
  String,
  JsonValue,
) as unknown as JsonObjectType;

/**
 * A {@link String} Brand proving that its exact text parses to {@link JsonValue}.
 *
 * The Brand preserves whitespace, property order, and number spelling. Convert
 * it totally to {@link JsonValue} through {@link JsonValueFromJson} or
 * {@link jsonToJsonValue}.
 */
export const Json = /*#__PURE__*/ brand(
  "Json",
  String,
  validateJson,
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} cannot be parsed into a JsonValue.`,
);
export type Json = typeof Json.Output;

/** Totally parses proven {@link Json} text into an exact {@link JsonValue}. */
export const jsonToJsonValue = (value: Json): JsonValue => parseJson(value);

/** Totally encodes an exact {@link JsonValue} as canonical {@link Json} text. */
export const jsonValueToJson = (value: JsonValue): Json =>
  stringifyJsonValue(JsonValue.to(value));

/**
 * {@link Json} to {@link JsonValue} transformation.
 *
 * Decoding unknown input first validates the Json Brand. Starting from the
 * typed Json parent is infallible. Encoding canonicalizes JSON text.
 */
export const JsonValueFromJson = /*#__PURE__*/ transform(
  "JsonValueFromJson",
  Json,
  JsonValue,
  {
    from: (value) => ok(parseJson(value)),
    to: stringifyJsonValue,
  },
);
