import { Effect, Layer } from "effect";
import { customAlphabet } from "nanoid";
import { Crypto } from "./Crypto.js";
import { NodeId } from "./Timestamp.js";

const nanoidForNodeId = customAlphabet("0123456789abcdef", 16);

export const CryptoLive = Layer.succeed(
  Crypto,
  Crypto.of({
    makeNodeId: Effect.sync(() => nanoidForNodeId() as NodeId),
  })
);
