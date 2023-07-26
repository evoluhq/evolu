import { Context } from "effect";
import { NodeId } from "./Timestamp.js";

export const customAlphabetForNodeId = "0123456789abcdef";

export interface Crypto {
  readonly makeNodeId: () => NodeId;
}

export const Crypto = Context.Tag<Crypto>();

// CryptoLive.native.ts
// CryptoLive.web.ts
// imho nejlepsi!
