import {
  object,
  optional,
  record,
  String,
  type InferErrors,
} from "./chains/api.mts";
import { NumberFromString } from "./chains/number-from-string.mts";

const Rest = record(String, NumberFromString);
const _OR = object(
  {
    total: NumberFromString,
    count: optional(NumberFromString),
  },
  Rest,
);

export type Input = typeof _OR.Input;
export type Output = typeof _OR.Output;
export type Errors = InferErrors<typeof _OR>;
export type NodeError = typeof _OR.Error;
export type FromUnknownResult = ReturnType<typeof _OR.fromUnknown>;
export type FromResult = ReturnType<typeof _OR.from>;
export type FromParentResult = ReturnType<typeof _OR.from.parent>;
export type ToInput = Parameters<typeof _OR.to>[0];
export type ToResult = ReturnType<typeof _OR.to>;
export type Parent = typeof _OR.parent;
export type Props = typeof _OR.props;
export type RecordType = typeof _OR.record;
