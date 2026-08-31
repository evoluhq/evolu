import { array, type InferErrors, literal } from "./chains/api.mts";
// oxlint-disable-next-line import/no-unassigned-import -- Includes the complete compiler-performance dependency chain.
import "./chains/root.mts";

const Hello = literal("Hello");
const _Answer = literal(42);
const _Hellos = array(Hello);

export type StringOutput = typeof Hello.Output;
export type StringErrors = InferErrors<typeof Hello>;
export type StringFromInput = Parameters<typeof Hello.from>[0];
export type StringFromResult = ReturnType<typeof Hello.from>;
export type StringFromParentInput = Parameters<typeof Hello.from.parent>[0];
export type StringFromParentResult = ReturnType<typeof Hello.from.parent>;
export type StringFromUnknownResult = ReturnType<typeof Hello.fromUnknown>;

export type NumberOutput = typeof _Answer.Output;
export type NumberErrors = InferErrors<typeof _Answer>;
export type NumberFromResult = ReturnType<typeof _Answer.from>;
export type NumberFromParentResult = ReturnType<typeof _Answer.from.parent>;

export type ArrayOutput = typeof _Hellos.Output;
export type ArrayErrors = InferErrors<typeof _Hellos>;
export type ArrayFromResult = ReturnType<typeof _Hellos.from>;
export type ArrayFromParentResult = ReturnType<typeof _Hellos.from.parent>;
