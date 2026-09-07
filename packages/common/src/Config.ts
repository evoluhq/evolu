/**
 * Strict configuration Types with explicit application policy.
 *
 * Decode configuration at startup, then pass validated values to constructors
 * or Tasks. The application decides how to load configuration, combine sources,
 * and apply defaults. Declare defaults with {@link withDefault}, or use `??`
 * where a value is consumed. Invalid supplied values still fail decoding.
 *
 * Resolve source precedence before replacing absence with defaults. If a source
 * Type already provides defaults and later composition needs to distinguish
 * them from supplied values, use `strategy: "preserve"` and inspect
 * `defaultUsed` explicitly. Preserving this evidence does not choose a merging
 * policy: the application still decides which source wins.
 *
 * {@link env} creates a pure, reversible codec. It does not read global state,
 * load files, merge sources, or introduce a Run dependency. Tests can pass
 * ordinary objects; a Node.js entry point can pass `process.env`.
 *
 * @module
 */

import { assert } from "./Assert.ts";
import {
  createMutableRecord,
  filterObjectKeys,
  isPlainObject,
} from "./Object.ts";
import { ok } from "./Result.ts";
import {
  CamelCaseIdentifier,
  camelCaseToConstantCase,
  ConstantCaseIdentifier,
  EvoluType,
  maxLength,
  object,
  objectKeys,
  String,
  transform,
  Unknown,
  type AnyType,
  type InferErrors,
  type ValidateLiteral,
  type ObjectKeysType,
  type ObjectProps,
  type ObjectType,
  type TransformType,
  type TypeNode,
  type withDefault,
} from "./Type.ts";
import type {
  CompileTimeError,
  IsUnion,
  UnionToIntersection,
} from "./Types.ts";

/**
 * An environment variable name in Evolu's configuration convention.
 *
 * Names are {@link ConstantCaseIdentifier}s of at most 255 characters, including
 * the application prefix. This is an Evolu convention, not an operating-system
 * limit. Double underscores do not introduce nesting.
 *
 * ### Example
 *
 * ```ts
 * import { assertErr, assertOk, EnvName } from "@evolu/common";
 *
 * assertOk(
 *   EnvName.fromUnknown("APP_MAX_OWNER_BYTES"),
 *   "APP_MAX_OWNER_BYTES",
 * );
 * assertErr(EnvName.fromUnknown("APP_maxOwnerBytes"));
 * assertErr(EnvName.fromUnknown("APP_DB__PORT"));
 * ```
 */
export const EnvName = /*#__PURE__*/ maxLength(255)(ConstantCaseIdentifier);
export type EnvName = typeof EnvName.Output;

/** The configuration codec returned by {@link env}. */
export interface EnvType<Props extends EnvProps> extends TransformType<
  typeof Unknown,
  ObjectKeysType<EnvKeyType, ObjectType<EnvFlatProps<Props>>>,
  "Env",
  never,
  Readonly<
    Record<
      string,
      ObjectType<EnvFlatProps<Props>>["CanonicalInput"][keyof ObjectType<
        EnvFlatProps<Props>
      >["CanonicalInput"]]
    >
  >
> {}

/** Fields and one-level namespace groups used to construct an {@link env} Type. */
export type EnvProps = Readonly<
  Record<string, ObjectProps[string] | ObjectProps>
>;

/**
 * Creates a reversible environment-variable codec with a flat decoded output.
 *
 * Declare camelCase fields directly, or put them in one-level CONSTANT_CASE
 * namespace groups. A direct `port` field reads `PORT`; a `maxOwnerBytes` field
 * in an `EVOLU_RELAY` group reads `EVOLU_RELAY_MAX_OWNER_BYTES`. Groups affect
 * external names only. Duplicate decoded fields or encoded names are rejected
 * during construction, even when their Types are identical.
 *
 * Selects exact declared unprefixed names and all keys within declared
 * namespaces. Namespace selection ignores casing so incorrectly cased names
 * fail validation instead of being ignored. Selected names must match their
 * exact declared spelling. Unrelated variables are ignored; misspelled
 * unprefixed names or namespace prefixes can therefore still look absent.
 *
 * Field Types must encode to strings. Optional fields may be absent, but
 * explicit `undefined` values are rejected. Empty strings remain present and
 * must satisfy the field Type. Compose {@link withDefault} to supply defaults.
 * Encoding emits canonical external names and string values, preserving absence
 * when the field codec does. Errors retain external names and nested paths.
 *
 * Reads own string properties from any non-null object, including
 * `process.env`. Selected properties must be enumerable data properties;
 * getters are never read. Prototypes and internal contents such as Map entries
 * are ignored. Non-object inputs fail with standard object errors. Schema names
 * must satisfy {@link EnvName}; groups cannot be nested. Loading and source
 * precedence remain explicit application code.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertOk,
 *   assertType,
 *   ByteSizeLiteral,
 *   env,
 *   optional,
 *   Port,
 *   PortFromString,
 *   withDefault,
 * } from "@evolu/common";
 *
 * const RelayEnv = env({
 *   port: withDefault(optional(PortFromString), Port.orThrow(4000)),
 *   EVOLU_RELAY: {
 *     maxOwnerBytes: optional(ByteSizeLiteral),
 *   },
 * });
 *
 * const result = RelayEnv.fromUnknown({
 *   PORT: "04000",
 *   EVOLU_RELAY_MAX_OWNER_BYTES: "512KiB",
 *   HOME: "/home/evolu",
 * });
 *
 * assertOk(result, { port: 4000, maxOwnerBytes: "512KiB" });
 * assertType<typeof result.value.port, Port>();
 * assertEqual(RelayEnv.to(result.value), {
 *   PORT: "4000",
 *   EVOLU_RELAY_MAX_OWNER_BYTES: "512KiB",
 * });
 *
 * assertOk(RelayEnv.fromUnknown({}), { port: 4000 });
 * assertErr(RelayEnv.fromUnknown({ PORT: "" }));
 * assertErr(RelayEnv.fromUnknown({ EVOLU_RELAY_MAX_OWENR_BYTES: "1MiB" }));
 * assertErr(RelayEnv.fromUnknown({ evolu_relay_max_owner_bytes: "1MiB" }));
 * ```
 */
export const env = <const Props extends EnvProps>(
  props: Props,
  ..._validation: [EnvValidation<Props>] extends [never]
    ? []
    : [EnvValidation<Props>]
): EnvType<Props> => {
  assert(
    isPlainObject(props),
    "Environment properties must be a plain object.",
  );
  const flat = createMutableRecord<string, ObjectProps[string]>();
  const inputNameByOutputName = new Map<string, string>();
  const outputNameByInputName = new Map<string, string>();
  const prefixes: Array<string> = [];
  const unprefixedNames = new Set<string>();

  for (const rootName of Reflect.ownKeys(props)) {
    const descriptor = Object.getOwnPropertyDescriptor(props, rootName)!;
    assert(
      typeof rootName === "string" &&
        descriptor.enumerable &&
        "value" in descriptor,
      "Environment properties must be enumerable string data properties.",
    );
    const grouped = ConstantCaseIdentifier.is(rootName);
    assert(
      grouped || CamelCaseIdentifier.is(rootName),
      `Invalid environment schema name ${JSON.stringify(rootName)}. Expected a camelCase field or CONSTANT_CASE namespace.`,
    );
    const rootValue: unknown = descriptor.value;
    const fields = grouped ? rootValue : { [rootName]: rootValue };
    assert(
      isPlainObject(fields) && !EvoluType.is(fields),
      "Environment groups must be plain objects containing fields.",
    );
    if (grouped) {
      assert(
        EnvName.is(rootName + "_A"),
        `Invalid environment namespace ${JSON.stringify(rootName)}. Names must fit within 255 characters.`,
      );
      prefixes.push(rootName + "_");
    }
    for (const name of Reflect.ownKeys(fields)) {
      const field = Object.getOwnPropertyDescriptor(fields, name)!;
      assert(
        typeof name === "string" && field.enumerable && "value" in field,
        "Environment fields must be enumerable string data properties.",
      );
      assert(
        CamelCaseIdentifier.is(name),
        `Invalid environment field ${JSON.stringify(name)}. Expected a camelCase identifier; groups cannot be nested.`,
      );
      assert(
        !inputNameByOutputName.has(name),
        `Duplicate environment field ${JSON.stringify(name)}.`,
      );
      const encoded =
        (grouped ? rootName + "_" : "") + camelCaseToConstantCase(name);
      assert(
        EnvName.is(encoded),
        `Invalid environment schema name ${JSON.stringify(encoded)}. Expected a CONSTANT_CASE identifier of at most 255 characters.`,
      );
      assert(
        !outputNameByInputName.has(encoded),
        `Duplicate environment variable ${JSON.stringify(encoded)}.`,
      );
      const property: unknown = field.value;
      const fieldType: unknown = EvoluType.is(property)
        ? property
        : isPlainObject(property)
          ? Object.getOwnPropertyDescriptor(property, "type")?.value
          : undefined;
      assert(
        EvoluType.is(fieldType),
        `Invalid environment field ${JSON.stringify(name)}. Expected a Type or optional/defaulted property; groups must use CONSTANT_CASE names.`,
      );
      flat[name] = property as ObjectProps[string];
      inputNameByOutputName.set(name, encoded);
      outputNameByInputName.set(encoded, name);
      if (!grouped) unprefixedNames.add(encoded);
    }
  }

  // Runtime construction validates the flattened fields; the public signature
  // checks their concrete Types and string encodings before flattening.
  const output = (
    object as unknown as (props: ObjectProps) => ObjectType<ObjectProps>
  )(flat);
  const key = transform("EnvKey", String, CamelCaseIdentifier, {
    // Identity fallback keeps this exposed codec round-trippable for other
    // valid camelCase identifiers. objectKeys accepts only declared fields.
    from: (value) => ok(outputNameByInputName.get(value) ?? value),
    to: (value) => inputNameByOutputName.get(value) ?? value,
  });
  const withKeys = objectKeys(key)(output);
  const type = transform("Env", Unknown, withKeys, {
    from: (value) => {
      if (typeof value !== "object" || value === null) return ok(value);
      return ok(
        filterObjectKeys(
          value,
          (key) =>
            unprefixedNames.has(key) ||
            prefixes.some((prefix) => key.toUpperCase().startsWith(prefix)),
        ),
      );
    },
    to: (value) => value,
  });
  // The maps preserve each field's name and codec; only the static flattening
  // cannot be expressed by the runtime loops above.
  return type as unknown as EnvType<Props>;
};

type EnvFlatProps<Props extends EnvProps> =
  UnionToIntersection<
    {
      [Key in keyof Props]: EnvDeclarationKind<Key> extends "group"
        ? Props[Key]
        : EnvDeclarationKind<Key> extends "field"
          ? { readonly [Field in Key]: Props[Key] }
          : never;
    }[keyof Props]
  > extends infer Flat extends ObjectProps
    ? Flat
    : {};

type EnvKeyType = TransformType<
  typeof String,
  typeof CamelCaseIdentifier,
  "EnvKey",
  never,
  string
>;

type EnvValidation<Props extends EnvProps> =
  | EnvKeysValidation<Props>
  | {
      [Key in keyof Props]: EnvDeclarationKind<Key> extends "group"
        ? Props[Key] extends ObjectProps
          ? EnvFieldsValidation<Props[Key]>
          : CompileTimeError<
              "Env",
              "Environment namespaces must contain a group of fields."
            >
        : EnvDeclarationKind<Key> extends "field"
          ? Props[Key] extends ObjectProps[string]
            ? EnvFieldValidation<Props[Key]>
            : CompileTimeError<
                "Env",
                "Environment fields must be Types, optional properties, or defaulted properties."
              >
          : CompileTimeError<
              "Env",
              "Environment declarations must use camelCase field names or CONSTANT_CASE namespace names."
            >;
    }[keyof Props];

type EnvFieldsValidation<Props extends ObjectProps> =
  | EnvKeysValidation<Props>
  | {
      [Key in keyof Props]: EnvDeclarationKind<Key> extends "field"
        ? EnvFieldValidation<Props[Key]>
        : CompileTimeError<
            "Env",
            "Environment fields must use camelCase names."
          >;
    }[keyof Props];

type EnvFieldValidation<Field> =
  IsUnion<Field> extends true
    ? CompileTimeError<"Env", "Environment fields must use one concrete Type.">
    : EnvFieldType<Field> extends infer T extends AnyType
      ? IsUnion<T> extends true
        ? CompileTimeError<
            "Env",
            "Environment fields must use one concrete Type."
          >
        : [T["CanonicalInput"]] extends [string]
          ? Extract<
              | "ObjectMissingProperty"
              | "ObjectPropertyAccess"
              | "ObjectExcessProperty",
              InferErrors<T>["type"]
            > extends never
            ? never
            : CompileTimeError<
                "Env",
                "Environment fields must not use error tags reserved for Object structure."
              >
          : CompileTimeError<
              "Env",
              "Environment fields must encode to strings."
            >
      : CompileTimeError<
          "Env",
          "Environment fields must use one concrete Type."
        >;

type EnvFieldType<Field> = Field extends TypeNode
  ? Field
  : Field extends { readonly type: infer T extends TypeNode }
    ? T
    : never;

type EnvKeysValidation<Props> =
  | (string extends keyof Props
      ? CompileTimeError<
          "Env",
          "Environment properties must use fixed string keys."
        >
      : never)
  | (IsUnion<Props> extends true
      ? CompileTimeError<
          "Env",
          "Environment properties must use one concrete schema."
        >
      : never)
  | {
      [Key in keyof Props]: Key extends string
        ? ValidateLiteral<Key> extends Key
          ? never
          : CompileTimeError<
              "Env",
              "Environment properties must use fixed string keys."
            >
        : CompileTimeError<
            "Env",
            "Environment properties must use fixed string keys."
          >;
    }[keyof Props];

// Classify declarations by casing; identifier Types validate the full grammar
// and name lengths during construction.
type EnvDeclarationKind<Key> = Key extends string
  ? Key extends Uppercase<Key>
    ? "group"
    : Key extends Uncapitalize<Key>
      ? "field"
      : "invalid"
  : "invalid";
