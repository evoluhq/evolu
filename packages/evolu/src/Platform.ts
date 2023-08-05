import { Context } from "effect";

export type FlushSync = (callback: () => void) => void;

export const FlushSync = Context.Tag<FlushSync>("evolu/FlushSync");
