import {
  BooleanFromString,
  nullishOr,
  object,
  optional,
  Port,
  PortFromString,
  withDefault,
  type InferErrors,
} from "../../../packages/common/src/Type.ts";
import "./chains/root.mts"; // oxlint-disable-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.

const Settings = object({
  port: withDefault(optional(PortFromString), Port.orThrow(4000)),
  enabled: withDefault(optional(nullishOr(BooleanFromString)), true, {
    strategy: "preserve",
  }),
});

export type Input = typeof Settings.Input;
export type Output = typeof Settings.Output;
export type CanonicalInput = typeof Settings.CanonicalInput;
export type Errors = InferErrors<typeof Settings>;
export type NodeError = typeof Settings.Error;
export type FromUnknownResult = ReturnType<typeof Settings.fromUnknown>;
export type FromResult = ReturnType<typeof Settings.from>;
export type FromParentResult = ReturnType<typeof Settings.from.parent>;
export type ToResult = ReturnType<typeof Settings.to>;
export type ToParentResult = ReturnType<typeof Settings.to.parent>;
