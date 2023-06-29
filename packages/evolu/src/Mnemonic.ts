import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import { InvalidMnemonicError, Mnemonic } from "./Types.js";

// Dynamic because it's big and rarely used.
// Two files, because wordlists should never change.
const importBip39WithEnglish = Effect.allPar(
  Effect.promise(() => import("@scure/bip39")),
  Effect.promise(() => import("@scure/bip39/wordlists/english"))
);

export const parseMnemonic = (
  mnemonic: string
): Effect.Effect<never, InvalidMnemonicError, Mnemonic> =>
  pipe(
    importBip39WithEnglish,
    Effect.flatMap(([{ validateMnemonic }, { wordlist }]) =>
      validateMnemonic(mnemonic, wordlist)
        ? Effect.succeed(mnemonic as Mnemonic)
        : Effect.fail<InvalidMnemonicError>({ _tag: "InvalidMnemonic" })
    )
  );

export const generateMnemonic = (): Effect.Effect<never, never, Mnemonic> =>
  pipe(
    importBip39WithEnglish,
    Effect.map(
      ([{ generateMnemonic }, { wordlist }]) =>
        generateMnemonic(wordlist, 128) as Mnemonic
    )
  );
