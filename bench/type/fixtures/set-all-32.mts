import { set, type InferErrors } from "./chains/api.mts";
import { T32 } from "./chains/factory-32.mts";

const S = set(T32);
void S;

export type Output = typeof S.Output;
export type Errors = InferErrors<typeof S>;
export type FromUnknownInput = Parameters<typeof S.fromUnknown>[0];
export type FromUnknownResult = ReturnType<typeof S.fromUnknown>;

export type FromInput = Parameters<
  typeof S.from
>[0];
export type FromResult = ReturnType<
  typeof S.from
>;

export type From1Input = Parameters<
  typeof S.from.parent
>[0];
export type From1Result = ReturnType<
  typeof S.from.parent
>;

export type From2Input = Parameters<
  typeof S.from.parent.parent
>[0];
export type From2Result = ReturnType<
  typeof S.from.parent.parent
>;

export type From3Input = Parameters<
  typeof S.from.parent.parent.parent
>[0];
export type From3Result = ReturnType<
  typeof S.from.parent.parent.parent
>;

export type From4Input = Parameters<
  typeof S.from.parent.parent.parent.parent
>[0];
export type From4Result = ReturnType<
  typeof S.from.parent.parent.parent.parent
>;

export type From5Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent
>[0];
export type From5Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent
>;

export type From6Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent
>[0];
export type From6Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent
>;

export type From7Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From7Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent
>;

export type From8Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From8Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From9Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From9Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From10Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From10Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From11Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From11Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From12Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From12Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From13Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From13Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From14Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From14Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From15Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From15Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From16Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From16Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From17Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From17Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From18Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From18Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From19Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From19Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From20Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From20Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From21Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From21Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From22Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From22Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From23Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From23Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From24Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From24Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From25Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From25Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From26Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From26Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From27Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From27Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From28Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From28Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From29Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From29Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From30Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From30Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From31Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From31Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;

export type From32Input = Parameters<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>[0];
export type From32Result = ReturnType<
  typeof S.from.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent
>;
