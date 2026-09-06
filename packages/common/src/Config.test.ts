import nodeAssert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
} from "./Assert.ts";
import { ByteLengthFromString, byteSizeToByteLength } from "./Bytes.ts";
import { EnvName, env, type EnvType } from "./Config.ts";
import {
  array,
  assertType,
  BooleanFromString,
  Int,
  json,
  localizeTypes,
  Number,
  object,
  optional,
  Port,
  PortFromString,
  String,
  typeErrorToIssues,
  withDefault,
  type Type,
  type TypeError,
  type TypeNode,
} from "./Type.ts";
import * as cs from "./intl/cs.ts";

describe("EnvName", () => {
  it("bounds canonical names including the prefix", () => {
    assertOk(EnvName.fromUnknown("A".repeat(255)));
    for (const value of [
      "A".repeat(256),
      "",
      "APP_port",
      "APP__PORT",
      "APP_PORT_",
      "APP_2FA",
      "APP-PΟRT",
    ]) {
      assertErr(EnvName.fromUnknown(value));
    }
  });
});

describe("env", () => {
  it("combines unprefixed fields and multiple namespaces into a flat output", () => {
    const Env = env({
      port: withDefault(optional(PortFromString), Port.orThrow(4000)),
      EVOLU_RELAY: {
        maxOwnerBytes: withDefault(
          optional(ByteLengthFromString),
          byteSizeToByteLength("1MiB"),
        ),
      },
      AUTH: { token: String },
    });
    const result = Env.fromUnknown({
      PORT: "04001",
      EVOLU_RELAY_MAX_OWNER_BYTES: "512KiB",
      AUTH_TOKEN: "token",
      PATH: "/bin",
      HOME: "/home",
      NEXT_OTHER: "ignored",
    });
    assertOk(result, { port: 4001, maxOwnerBytes: 524288, token: "token" });
    assertType<typeof result.value.port, Port>();
    assertType<typeof result.value.token, string>();
    assertEqual(Env.to(result.value), {
      PORT: "4001",
      EVOLU_RELAY_MAX_OWNER_BYTES: "524288",
      AUTH_TOKEN: "token",
    });
    assertOk(Env.fromUnknown(Env.to(result.value)), result.value);
    assertOk(Env.fromUnknown({ AUTH_TOKEN: "token" }), {
      port: 4000,
      maxOwnerBytes: 1048576,
      token: "token",
    });
    const invalid = Env.fromUnknown(
      { PORT: "bad", EVOLU_RELAY_MAX_OWNER_BYTES: "bad", AUTH_TOKNE: "bad" },
      { errors: "all" },
    );
    assertErr(invalid);
    assertEqual(
      typeErrorToIssues(Env, invalid.error).map(({ path }) => path),
      [
        ["PORT"],
        ["EVOLU_RELAY_MAX_OWNER_BYTES"],
        ["AUTH_TOKEN"],
        ["AUTH_TOKNE"],
      ],
    );
  });

  it("selects exact unprefixed names and rejects unknown namespace names regardless of casing", () => {
    const Env = env({
      port: optional(PortFromString),
      APP: { name: optional(String) },
      AUTH: {},
    });
    assertOk(
      Env.fromUnknown({
        PATH: "/bin",
        HOME: "/home",
        port: "bad",
        POTR: "bad",
        APPLICATION_NAME: "ignored",
      }),
      {},
    );
    for (const name of [
      "APP_UNKNOWN",
      "app_NAME",
      "App_name",
      "APP_name",
      "AUTH_UNKNOWN",
      "auth_UNKNOWN",
    ]) {
      const result = Env.fromUnknown({ [name]: "value" });
      assertErr(result);
      assertEqual(typeErrorToIssues(Env, result.error)[0]?.path, [name]);
    }
    assertOk(env({}).fromUnknown(process.env), {});
    assertEqual(env({}).to({}), {});
  });

  it("rejects duplicate output fields and encoded names", () => {
    nodeAssert.throws(
      () => env({ port: String, APP: { port: String } }),
      /Duplicate environment field "port"/u,
    );
    nodeAssert.throws(
      () => env({ APP: { port: String }, AUTH: { port: String } }),
      /Duplicate environment field "port"/u,
    );
    nodeAssert.throws(
      () => env({ appPort: String, APP: { port: String } }),
      /Duplicate environment variable "APP_PORT"/u,
    );
    nodeAssert.throws(
      () => env({ APP: { authToken: String }, APP_AUTH: { token: String } }),
      /Duplicate environment variable "APP_AUTH_TOKEN"/u,
    );
  });

  it("allows overlapping namespaces with unambiguous declared names", () => {
    const Env = env({ APP: { name: String }, APP_AUTH: { token: String } });
    assertOk(Env.fromUnknown({ APP_NAME: "app", APP_AUTH_TOKEN: "token" }), {
      name: "app",
      token: "token",
    });
    const result = Env.fromUnknown({
      APP_NAME: "app",
      APP_AUTH_TOKEN: "token",
      APP_AUTH_UNKNOWN: "bad",
    });
    assertErr(result);
    assertEqual(typeErrorToIssues(Env, result.error)[0]?.path, [
      "APP_AUTH_UNKNOWN",
    ]);
  });

  it("snapshots declarations and never invokes schema getters", () => {
    const group = { name: String };
    const props = { port: optional(PortFromString), APP: group };
    const Env = env(props);
    Object.assign(group, { name: Number, added: String });
    Object.assign(props, { port: Number, OTHER: { extra: String } });
    assertOk(Env.fromUnknown({ APP_NAME: "value", PORT: "4000" }), {
      port: 4000,
      name: "value",
    });
    assertErr(Env.fromUnknown({ APP_ADDED: "value" }));
    let reads = 0;
    const accessor = {
      enumerable: true,
      get: () => {
        reads++;
        return String;
      },
    };
    nodeAssert.throws(
      () => env(Object.defineProperty({}, "port", accessor)),
      /Environment properties must be enumerable string data properties/u,
    );
    nodeAssert.throws(
      () => env({ APP: Object.defineProperty({}, "name", accessor) }),
      /Environment fields must be enumerable string data properties/u,
    );
    nodeAssert.throws(
      () => env(Object.defineProperty({}, "port", { value: String })),
      /Environment properties must be enumerable string data properties/u,
    );
    nodeAssert.throws(
      () => env({ APP: Object.defineProperty({}, "name", { value: String }) }),
      /Environment fields must be enumerable string data properties/u,
    );
    nodeAssert.throws(
      // @ts-expect-error Environment properties must use fixed string keys.
      () => env(Object.assign({}, { [Symbol("invalidKey")]: String })),
      /Environment properties must be enumerable string data properties/u,
    );
    nodeAssert.throws(
      // @ts-expect-error Environment properties must use fixed string keys.
      () => env({ APP: Object.assign({}, { [Symbol("invalidKey")]: String }) }),
      /Environment fields must be enumerable string data properties/u,
    );
    assertEqual(reads, 0);
    nodeAssert.throws(
      () => env(Object.create({ port: String }) as { port: typeof String }),
      /Environment properties must be a plain object/u,
    );
    nodeAssert.throws(
      () =>
        env({
          APP: Object.create({ port: String }) as { port: typeof String },
        }),
      /Environment groups must be plain objects/u,
    );
    nodeAssert.throws(() => {
      // @ts-expect-error Namespace groups contain fields, not nested groups.
      env({ APP: { INNER: { name: String } } });
    }, /groups cannot be nested/u);
  });

  it("supports prototype-like field names without prototype mutation", () => {
    const Env = env({ APP: { constructor: String, toString: String } });
    const result = Env.fromUnknown({
      APP_CONSTRUCTOR: "value",
      APP_TO_STRING: "text",
    });
    assertOk(result, { constructor: "value", toString: "text" });
    assertEqual(Env.to(result.value), {
      APP_CONSTRUCTOR: "value",
      APP_TO_STRING: "text",
    });
  });

  it("selects variables, decodes strict values, and canonically encodes them", () => {
    const Settings = object({
      port: PortFromString,
      maxOwnerBytes: optional(ByteLengthFromString),
      verbose: optional(BooleanFromString),
    });
    const Env = env({ APP: Settings.props });
    assertType<typeof Env, EnvType<{ readonly APP: typeof Settings.props }>>();
    const result = Env.fromUnknown({
      APP_PORT: "04000",
      APP_MAX_OWNER_BYTES: "1MiB",
      APP_VERBOSE: "false",
      HOME: "/home/evolu",
      other: 42,
    });
    assertOk(result, { port: 4000, maxOwnerBytes: 1048576, verbose: false });
    assertType<typeof result.value, typeof Settings.Output>();
    assertEqual(Env.to(result.value), {
      APP_PORT: "4000",
      APP_MAX_OWNER_BYTES: "1048576",
      APP_VERBOSE: "false",
    });
    assertOk(Env.fromUnknown(Env.to(result.value)), result.value);
    assertOk(Env.from.parent({ APP_PORT: "4000" }), { port: 4000 });
    assertOk(Env.from(result.value), result.value);
    assertTrue(Env.is(result.value));
    const other = Env.output.key.orThrow("other");
    assertOk(Env.output.key.fromUnknown(Env.output.key.to(other)), other);
    assertFalse(Env.is({ port: "4000" }));
    assertFalse(Env.is({ port: 65536 }));
    assertEqual(Env.orNull({ APP_PORT: "invalid" }), null);
    nodeAssert.throws(() => Env.to({ port: 65536 as Port }));
    assertEqual(
      Env.orThrow({ APP_PORT: "4000", APP_MAX_OWNER_BYTES: "1000001" })
        .maxOwnerBytes,
      1000001,
    );
    assertEqual(
      Env.orThrow({ APP_PORT: "4000" }).maxOwnerBytes ??
        byteSizeToByteLength("1MiB"),
      1048576,
    );
  });

  it("preserves empty strings and rejects invalid or unknown selected values", () => {
    const Env = env({
      APP: { port: optional(PortFromString), name: optional(String) },
    });
    assertOk(Env.fromUnknown({ APP_NAME: "" }), { name: "" });
    assertEqual(Env.to(Env.orThrow({})), {});
    for (const source of [
      { APP_PORT: "" },
      { APP_PORT: " " },
      { APP_PORT: "65536" },
      { APP_PORT: "-1" },
      { APP_PORT: 4000 },
      { APP_PORT: null },
      { APP_POTR: "4000" },
      { APP_port: "4000" },
      { app_PORT: "4000" },
      { app_port: "4000" },
      { APP__PORT: "4000" },
      { APP_PORT_: "4000" },
      { APP_DB__PORT: "4000" },
      { APP_: "4000" },
      { ["APP_" + "A".repeat(252)]: "4000" },
    ])
      assertErr(Env.fromUnknown(source));
    assertOk(
      Env.fromUnknown({
        APPPORT: "invalid",
        APPOTHER_PORT: "invalid",
      }),
      {},
    );
  });

  it("rejects explicit undefined for required, optional, and unknown fields", () => {
    const Env = env({ APP: { port: PortFromString, name: optional(String) } });
    assertOk(Env.fromUnknown({ APP_PORT: "4000", HOME: undefined }), {
      port: 4000,
    });
    for (const key of ["APP_PORT", "APP_NAME", "APP_UNKNOWN"]) {
      const result = Env.fromUnknown({ APP_PORT: "4000", [key]: undefined });
      assertErr(result);
      assertEqual(
        typeErrorToIssues(Env, result.error).map(({ path }) => path),
        [[key]],
      );
    }
  });

  it("keeps original names in required, invalid, and excess-property issues", () => {
    const Env = env({
      APP: { port: PortFromString, verbose: optional(BooleanFromString) },
    });
    const result = Env.fromUnknown(
      { APP_PORT: "65536", APP_VERBOSE: "maybe", APP_POTR: "4000" },
      { errors: "all" },
    );
    assertErr(result);
    assertEqual(
      typeErrorToIssues(Env, result.error).map(({ path }) => path),
      [["APP_PORT"], ["APP_VERBOSE"], ["APP_POTR"]],
    );
    assertEqual(
      typeErrorToIssues(Env, result.error)[0]?.message,
      "The value 65536 must be less than or equal to 65535.",
    );
    const missing = Env.fromUnknown({});
    assertErr(missing);
    assertEqual(typeErrorToIssues(Env, missing.error), [
      {
        path: ["APP_PORT"],
        message: 'The required property "APP_PORT" is missing.',
      },
    ]);
    const first = Env.fromUnknown({
      APP_PORT: "invalid",
      APP_VERBOSE: "maybe",
    });
    assertErr(first);
    assertEqual(typeErrorToIssues(Env, first.error).length, 1);
    assertEqual(
      Env["~standard"].validate({ APP_PORT: "invalid", APP_VERBOSE: "maybe" }),
      {
        issues: [
          {
            path: ["APP_PORT"],
            message: 'The value "invalid" is not a decimal integer.',
          },
          {
            path: ["APP_VERBOSE"],
            message: 'The value "maybe" is not a boolean. Use true or false.',
          },
        ],
      },
    );
  });

  it("preserves nested JSON paths without implicit ENV nesting", () => {
    const [PortsJson] = json(array(Int), "PortsJson");
    const Env = env({ APP: { ports: PortsJson } });
    const result = Env.fromUnknown({ APP_PORTS: '[80,"invalid"]' });
    assertErr(result);
    assertEqual(typeErrorToIssues(Env, result.error)[0]?.path, [
      "APP_PORTS",
      1,
    ]);
    assertEqual(Env.to(Env.orThrow({ APP_PORTS: "[80,443]" })), {
      APP_PORTS: "[80,443]",
    });
  });

  it("composes explicit defaults without losing supplied-input evidence", () => {
    const Env = env({
      APP: {
        port: withDefault(optional(PortFromString), Port.orThrow(4000), {
          strategy: "preserve",
        }),
      },
    });
    const missing = Env.fromUnknown({});
    assertOk(missing, {
      port: { value: 4000, defaultUsed: true, original: "missing" },
    });
    assertEqual(Env.to(missing.value), {});
    const supplied = Env.fromUnknown({ APP_PORT: "04000" });
    assertOk(supplied, { port: { value: 4000, defaultUsed: false } });
    assertEqual(Env.to(supplied.value), { APP_PORT: "4000" });
    const invalid = Env.fromUnknown({ APP_PORT: "65536" });
    assertErr(invalid);
    assertEqual(typeErrorToIssues(Env, invalid.error), [
      {
        path: ["APP_PORT"],
        message: "The value 65536 must be less than or equal to 65535.",
      },
    ]);
    assertErr(Env.fromUnknown({ APP_PORT: undefined }));
  });

  it("supports unprefixed fields, host objects, and descriptor-safe selection", () => {
    const Env = env({ port: PortFromString });
    assertOk(Env.fromUnknown({ PORT: "4000" }), { port: 4000 });
    assertEqual(Env.to(Env.orThrow({ PORT: "04000" })), { PORT: "4000" });
    const AppEnv = env({ APP: { port: optional(PortFromString) } });
    assertOk(AppEnv.fromUnknown(Object.create({ APP_PORT: "invalid" })), {});
    assertOk(
      AppEnv.fromUnknown(
        Object.assign(Object.create(null), { APP_PORT: "4000" }),
      ),
      { port: 4000 },
    );
    let reads = 0;
    const source = Object.defineProperties(
      {},
      {
        APP_PORT: {
          enumerable: true,
          get: () => {
            reads++;
            return "4000";
          },
        },
        HOME: {
          enumerable: true,
          get: () => {
            reads++;
            return "ignored";
          },
        },
      },
    );
    assertErr(AppEnv.fromUnknown(source));
    assertEqual(reads, 0);
    assertErr(
      AppEnv.fromUnknown(
        Object.defineProperty({}, "APP_PORT", { value: undefined }),
      ),
    );
    assertOk(
      AppEnv.fromUnknown(
        Object.defineProperty({}, "HOME", {
          get: () => {
            throw new Error("Unrelated getter");
          },
        }),
      ),
      {},
    );
    assertOk(AppEnv.fromUnknown({ [Symbol("APP_PORT")]: "ignored" }), {});
    assertOk(env({ EVOLU_CONFIG_TEST: {} }).fromUnknown(process.env), {});
    for (const value of [null, undefined, "", 42, false]) {
      const result = AppEnv.fromUnknown(value);
      assertErr(result, {
        type: "Env",
        outputError: {
          type: "ObjectKeys",
          error: { type: "Object", reason: { kind: "NotObject", value } },
        },
      });
      assertEqual(typeErrorToIssues(AppEnv, result.error), [
        {
          path: [],
          message: `A value ${JSON.stringify(value)} is not an object.`,
        },
      ]);
    }
  });

  it("selects own properties consistently from arrays and other objects", () => {
    const Env = env({ APP: { port: optional(PortFromString) } });
    const Required = env({ APP: { port: PortFromString } });
    for (const source of [
      [],
      new Date(0),
      new Map([["APP_PORT", "4000"]]),
      /value/u,
    ]) {
      assertOk(Env.fromUnknown(source), {});
      const missing = Required.fromUnknown(source);
      assertErr(missing);
      assertEqual(typeErrorToIssues(Required, missing.error)[0]?.path, [
        "APP_PORT",
      ]);

      Object.assign(source, { APP_PORT: "4000" });
      assertOk(Required.fromUnknown(source), { port: 4000 });
      Object.assign(source, { APP_PORT: "invalid" });
      const invalid = Env.fromUnknown(source);
      assertErr(invalid);
      assertEqual(typeErrorToIssues(Env, invalid.error)[0]?.path, ["APP_PORT"]);
    }

    const Unprefixed = env({ port: optional(PortFromString) });
    const result = Unprefixed.fromUnknown([]);
    assertOk(result, {});
  });

  it("rejects invalid schema names at construction", () => {
    nodeAssert.throws(
      () => {
        // @ts-expect-error Environment fields must use camelCase names.
        env({ APP: { Port: PortFromString } });
      },
      {
        message:
          'Invalid environment field "Port". Expected a camelCase identifier; groups cannot be nested.',
      },
    );
    nodeAssert.throws(() =>
      // @ts-expect-error Environment properties must use fixed string keys.
      env({ APP: { ["a".repeat(252)]: String } }),
    );
    // @ts-expect-error Environment properties must use fixed string keys.
    const Env = env({ APP: { ["a".repeat(251)]: String } });
    assertOk(Env.fromUnknown({ ["APP_" + "A".repeat(251)]: "value" }));
  });

  it("rejects malformed namespace declarations", () => {
    for (const name of ["APP_", "APP__", "APP-NAME", "", "Port"]) {
      nodeAssert.throws(
        // @ts-expect-error Environment properties must use fixed string keys.
        () => env({ [name]: {} }),
        /Invalid environment schema name/u,
      );
    }
    nodeAssert.throws(
      // @ts-expect-error Environment properties must use fixed string keys.
      () => env({ ["A".repeat(254)]: {} }),
      /Invalid environment namespace/u,
    );
  });

  it("rejects invalid field and group values with actionable errors", () => {
    const Group = env({ APP: { type: String } });
    assertOk(Group.fromUnknown({ APP_TYPE: "value" }), { type: "value" });
    assertEqual(Group.to({ type: "value" }), { APP_TYPE: "value" });
    nodeAssert.throws(
      // @ts-expect-error Environment namespaces must contain a group of fields.
      () => env({ APP: String }),
      /Environment groups must be plain objects containing fields/u,
    );
    nodeAssert.throws(
      // @ts-expect-error Environment fields must be Types, optional properties, or defaulted properties.
      () => env({ app: { port: String } }),
      /groups must use CONSTANT_CASE names/u,
    );
    nodeAssert.throws(() => {
      // @ts-expect-error Environment declarations require Types or namespace groups.
      env({ port: 4000 });
    }, /Expected a Type or optional\/defaulted property/u);
  });

  it("localizes field errors through the composed codec", () => {
    const Env = env({ APP: { name: String } });
    const localized = localizeTypes(
      { Env },
      {
        cs: {
          Object: cs.formatObjectError,
          String: cs.formatStringError,
          CamelCaseIdentifier: cs.formatIdentifierError,
        },
      },
    );
    const result = localized.cs.Env.fromUnknown({ APP_NAME: 1 });
    assertErr(result);
    assertEqual(typeErrorToIssues(localized.cs.Env, result.error), [
      { path: ["APP_NAME"], message: "Hodnota 1 musí být text." },
    ]);
    const root = localized.cs.Env.fromUnknown(null);
    const objectRoot = object({}).fromUnknown(null);
    assertErr(root);
    assertErr(objectRoot);
    assertEqual(typeErrorToIssues(localized.cs.Env, root.error), [
      { path: [], message: cs.formatObjectError(objectRoot.error) },
    ]);
  });

  it("requires concrete field Types that encode to strings", () => {
    const reject = (
      erased: TypeNode,
      reserved: Type<
        "CustomEnv",
        string,
        string,
        TypeError<"ObjectPropertyAccess">
      >,
      broad: Type<"CustomEnv", string, string, TypeError>,
    ) => {
      // @ts-expect-error Environment namespaces must contain a group of fields.
      env({ APP: String });
      // @ts-expect-error Environment namespaces must contain a group of fields.
      env({ APP: optional(String) });
      // @ts-expect-error Environment namespaces must contain a group of fields.
      env({ APP: withDefault(optional(String), "value") });
      // @ts-expect-error Environment fields must be Types, optional properties, or defaulted properties.
      env({ app: { port: String } });
      // @ts-expect-error Environment declarations must use camelCase field names or CONSTANT_CASE namespace names.
      env({ Port: String });
      // @ts-expect-error Environment fields must be Types, optional properties, or defaulted properties.
      env({ port: { type: String } });
      // @ts-expect-error Environment fields must use one concrete Type.
      env({ field: erased });
      // @ts-expect-error Environment fields must not use error tags reserved for Object structure.
      env({ APP: { field: reserved } });
      // @ts-expect-error Environment fields must not use error tags reserved for Object structure.
      env({ field: broad });
      // @ts-expect-error Environment fields must encode to strings.
      env({ port: Number });
      // @ts-expect-error Environment fields must encode to strings.
      env({ APP: { db: object({ port: PortFromString }) } });
      // @ts-expect-error Namespace groups contain fields, not nested groups.
      env({ APP: { NESTED: { port: PortFromString } } });
      // @ts-expect-error env accepts field and namespace declarations, not a prefix string.
      env("APP");
      // @ts-expect-error env accepts field and namespace declarations, not a constructed Type.
      env(object({ port: PortFromString }));
      const uncertain = (true as boolean)
        ? { port: PortFromString }
        : { name: String };
      // @ts-expect-error Environment properties must use one concrete schema.
      env(uncertain);
      // @ts-expect-error Environment properties must use one concrete schema.
      env({ APP: uncertain });
      const field = (true as boolean) ? PortFromString : String;
      // @ts-expect-error Environment fields must use one concrete Type.
      env({ port: field });
      const dynamic: Record<string, typeof String> = {};
      // @ts-expect-error Environment properties must use fixed string keys.
      env(dynamic);
      // @ts-expect-error Environment properties must use fixed string keys.
      env({ APP: dynamic });
      const template = {} as Record<
        `APP_${string}`,
        { port: typeof PortFromString }
      >;
      // @ts-expect-error Environment properties must use fixed string keys.
      env(template);
      // @ts-expect-error Environment properties must use fixed string keys.
      env({ [Symbol("invalidKey")]: String });
    };
    assertType<
      typeof reject extends (...args: Array<never>) => void ? true : false,
      true
    >();
  });
});
