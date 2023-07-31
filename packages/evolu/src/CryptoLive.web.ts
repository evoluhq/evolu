import { Effect, Layer } from "effect";
import { customAlphabet } from "nanoid";
import { Crypto, Mnemonic } from "./Crypto.js";
import { NodeId } from "./Timestamp.js";

const nanoidForNodeId = customAlphabet("0123456789abcdef", 16);

const makeNodeId: Crypto["makeNodeId"] = Effect.sync(
  () => nanoidForNodeId() as NodeId
);

const makeMnemonic: Crypto["makeMnemonic"] = Effect.succeed(
  1 as unknown as Mnemonic
);

export const CryptoLive = Layer.succeed(Crypto, {
  makeNodeId,
  makeMnemonic,
});
