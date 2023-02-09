import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { either } from "fp-ts";
import { Either } from "fp-ts/Either";
import { Mnemonic } from "./model.js";
import { RestoreOwnerError } from "./types.js";

export const generateMnemonic = (): Mnemonic =>
  bip39.generateMnemonic(wordlist, 128) as Mnemonic;

export const parseMnemonic = (
  mnemonic: string
): Either<RestoreOwnerError, Mnemonic> =>
  bip39.validateMnemonic(mnemonic.trim(), wordlist)
    ? either.right(mnemonic as Mnemonic)
    : either.left({ type: "invalid mnemonic" });

export const mnemonicToEntropy = (mnemonic: Mnemonic): Uint8Array =>
  bip39.mnemonicToEntropy(mnemonic, wordlist);
