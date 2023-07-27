import { Context, Effect } from "effect";
import { NodeId } from "./Timestamp.js";

export const customAlphabetForNodeId = "0123456789abcdef";

export interface Crypto {
  readonly makeNodeId: Effect.Effect<never, never, NodeId>;
  // TODO: makeNanoId
}

export const Crypto = Context.Tag<Crypto>();
