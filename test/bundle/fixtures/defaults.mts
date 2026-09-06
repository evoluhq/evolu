import {
  assertType,
  Boolean,
  type ByteLength,
  ByteLengthFromString,
  byteSizeToByteLength,
  type Defaulted,
  env,
  object,
  omit,
  optional,
  Port,
  PortFromString,
  String,
  type OptionalProperty,
  type Simplify,
  withDefault,
} from "@evolu/common";

const Replaced = withDefault(optional(Boolean), true);
// @ts-expect-error withDefault requires an optional property or a Type whose Output includes null or undefined.
withDefault(Boolean, true);
// @ts-expect-error withDefault requires an optional property or a Type whose Output includes null or undefined.
withDefault(Boolean, true, { strategy: "preserve" });
assertType<
  typeof Replaced extends OptionalProperty<typeof Boolean> ? true : false,
  false
>();

const Settings = object({
  replaced: Replaced,
  preserved: withDefault(optional(Boolean), true, { strategy: "preserve" }),
  optional: optional(Boolean),
});

assertType<
  Simplify<typeof Settings.Input>,
  {
    readonly replaced?: boolean;
    readonly preserved?: boolean;
    readonly optional?: boolean;
  }
>();
assertType<
  Simplify<typeof Settings.Output>,
  {
    readonly replaced: boolean;
    readonly preserved: Defaulted<boolean, true, "missing">;
    readonly optional?: boolean;
  }
>();

const Projected = omit(Settings, "optional");
assertType<typeof Projected.Output.replaced, boolean>();
assertType<
  typeof Projected.Output.preserved,
  Defaulted<boolean, true, "missing">
>();
const WithoutDefaults = omit(Settings, "replaced", "preserved");
assertType<typeof WithoutDefaults.Output.optional, boolean | undefined>();

const Env = env({
  port: withDefault(optional(PortFromString), Port.orThrow(4000)),
  AUTH: { token: optional(String) },
  APP: {
    maxOwnerBytes: withDefault(
      optional(ByteLengthFromString),
      byteSizeToByteLength("1MiB"),
    ),
  },
});
// @ts-expect-error Environment namespaces must contain a group of fields.
env({ APP: String });
// @ts-expect-error Environment fields must be Types, optional properties, or defaulted properties.
env({ app: { port: String } });
// @ts-expect-error Environment declarations must use camelCase field names or CONSTANT_CASE namespace names.
env({ Port: String });
// @ts-expect-error Environment fields must be Types, optional properties, or defaulted properties.
env({ port: { type: String } });
assertType<
  typeof Env.Output.maxOwnerBytes extends ByteLength ? true : false,
  true
>();
assertType<{} extends typeof Env.Output ? true : false, false>();

assertType<typeof Env.Output.port, Port>();
assertType<typeof Env.Output.token, string | undefined>();
// @ts-expect-error Namespace names are absent from the flat output.
type _Group = (typeof Env.Output)["APP"];
