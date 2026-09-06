import { env } from "../../../packages/common/src/Config.ts";
import { ByteLengthFromString } from "../../../packages/common/src/Bytes.ts";
import {
  optional,
  PortFromString,
  type InferErrors,
} from "../../../packages/common/src/Type.ts";
import "./chains/root.mts"; // oxlint-disable-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.

const Env = env({
  port: optional(PortFromString),
  EVOLU_RELAY: {
    maxOwnerBytes: optional(ByteLengthFromString),
  },
});

export type Input = typeof Env.Input;
export type Output = typeof Env.Output;
export type CanonicalInput = typeof Env.CanonicalInput;
export type Errors = InferErrors<typeof Env>;
export type NodeError = typeof Env.Error;
export type FromUnknownResult = ReturnType<typeof Env.fromUnknown>;
export type FromResult = ReturnType<typeof Env.from>;
export type FromParentResult = ReturnType<typeof Env.from.parent>;
export type ToResult = ReturnType<typeof Env.to>;
export type ObjectKeysType = typeof Env.output;
export type KeyType = typeof Env.output.key;
