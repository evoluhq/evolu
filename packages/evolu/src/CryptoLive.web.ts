import { Effect, Layer } from "effect";
import {
  HmacService,
  Mnemonic,
  MnemonicService,
  Sha512Service,
} from "./Crypto.js";
// import { customAlphabet } from "nanoid";
// import { Crypto, Mnemonic } from "./Crypto.js";
// import { NodeId } from "./Timestamp.js";

const importBip39WithEnglish = Effect.all(
  [
    // Two files because wordlists never change.
    Effect.promise(() => import("@scure/bip39")),
    Effect.promise(() => import("@scure/bip39/wordlists/english")),
  ],
  { concurrency: "unbounded" }
);

export const MnemonicServiceLive = Layer.succeed(
  MnemonicService,
  MnemonicService.of({
    make: importBip39WithEnglish.pipe(
      Effect.map(
        ([{ generateMnemonic }, { wordlist }]) =>
          generateMnemonic(wordlist, 128) as Mnemonic
      )
    ),
    mnemonicToSeed: (mnemonic) =>
      Effect.promise(() => import("@scure/bip39")).pipe(
        Effect.flatMap((a) => Effect.promise(() => a.mnemonicToSeed(mnemonic)))
      ),
  })
);

export const HmacServiceLive = Layer.succeed(
  HmacService,
  HmacService.of({
    make: Effect.promise(() => import("@noble/hashes/hmac")).pipe(
      Effect.map(({ hmac }) => hmac)
    ),
  })
);

export const Sha512ServiceLive = Layer.succeed(
  Sha512Service,
  Sha512Service.of({
    make: Effect.promise(() => import("@noble/hashes/sha512")).pipe(
      Effect.map(({ sha512 }) => sha512)
    ),
  })
);

// const nanoidForNodeId = customAlphabet("0123456789abcdef", 16);

// export const CryptoLive = Layer.succeed(
//   Crypto,
//   Crypto.of({
//     makeNodeId: Effect.sync(() => nanoidForNodeId() as NodeId),

//     makeMnemonic: importBip39WithEnglish.pipe(
//       Effect.map(
//         ([{ generateMnemonic }, { wordlist }]) =>
//           generateMnemonic(wordlist, 128) as Mnemonic
//       )
//     ),

//     mnemonicToSeed: (mnemonic) =>
//       Effect.promise(() => import("@scure/bip39")).pipe(
//         Effect.flatMap((a) => Effect.promise(() => a.mnemonicToSeed(mnemonic)))
//       ),

//     hmac: Effect.promise(() => import("@noble/hashes/hmac")).pipe(
//       Effect.map(({ hmac }) => hmac)
//     ),

//     sha512: Effect.promise(() => import("@noble/hashes/sha512")).pipe(
//       Effect.map(({ sha512 }) => sha512)
//     ),
//   })
// );
