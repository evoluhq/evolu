---
"@evolu/common": minor
---

Exposed reusable Type factory declarations

`ValidateLiteral` is now exported for factories that require one concrete
literal parameter. It preserves exact literals and rejects widened, union,
branded, and open template literal types at compile time.

`ValidateOutput` is also exported for factories that require one concrete Type
node. It rejects TypeScript unions of Type nodes while accepting a `union` Type.

`EnvType<Props>` names the configuration codec returned by `env`, including
its flat output and grouped field declarations.

```ts
import {
  assertEqual,
  assertType,
  env,
  object,
  PortFromString,
  type AnyType,
  type EnvType,
  type ValidateLiteral,
  type ValidateOutput,
} from "@evolu/common";

const definePrefix = <Prefix extends string>(
  prefix: Prefix & ValidateLiteral<Prefix>,
): Prefix => prefix;

const prefix = definePrefix("APP");
assertType<typeof prefix, "APP">();
const widened: string = "APP";
// @ts-expect-error Expected must be one concrete literal value.
definePrefix(widened);

const Settings = object({ port: PortFromString });
const defineOutput = <T extends AnyType>(type: T & ValidateOutput<T>): T =>
  type;
const Output = defineOutput(Settings);
assertType<typeof Output, typeof Settings>();
const uncertain = Settings as typeof Settings | typeof PortFromString;
// @ts-expect-error Output Type must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes.
defineOutput(uncertain);

const Env = env({ [prefix]: Output.props });
assertType<typeof Env, EnvType<{ readonly APP: typeof Settings.props }>>();
assertEqual(Env.orThrow({ APP_PORT: "4000" }), { port: 4000 });
```
