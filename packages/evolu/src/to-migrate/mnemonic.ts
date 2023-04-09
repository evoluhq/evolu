import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { either } from "fp-ts";
import { Either } from "fp-ts/lib/Either.js";
import { urlAlphabet } from "nanoid";
import { Mnemonic, Owner, OwnerId } from "../Model.js";
import { RestoreOwnerError } from "./types.js";

export const parseMnemonic = (
  mnemonic: string
): Either<RestoreOwnerError, Mnemonic> =>
  bip39.validateMnemonic(mnemonic.trim(), wordlist)
    ? either.right(mnemonic as Mnemonic)
    : either.left({ type: "invalid mnemonic" });

const generateMnemonic = (): Mnemonic =>
  bip39.generateMnemonic(wordlist, 128) as Mnemonic;

// SLIP-21 implementation
// https://github.com/satoshilabs/slips/blob/master/slip-0021.md
const slip21Derive = (seed: Uint8Array, path: string[]): Uint8Array => {
  let m = hmac(sha512, "Symmetric key seed", seed);
  for (let i = 0; i < path.length; i++) {
    const p = new TextEncoder().encode(path[i]);
    const e = new Uint8Array(p.byteLength + 1);
    e[0] = 0;
    e.set(p, 1);
    m = hmac(sha512, m.slice(0, 32), e);
  }
  return m.slice(32, 64);
};

const seedToOwnerId = (seed: Uint8Array): OwnerId => {
  const key = slip21Derive(seed, ["Evolu", "Owner Id"]);
  // convert key to nanoid
  let id = "";
  for (let i = 0; i < 21; i++) {
    id += urlAlphabet[key[i] & 63];
  }
  return id as OwnerId;
};

const seedToEncryptionKey = (seed: Uint8Array): Uint8Array =>
  slip21Derive(seed, ["Evolu", "Encryption Key"]);

export const createOwner = (mnemonic: Mnemonic = generateMnemonic()): Owner => {
  // always use empty passphrase
  const seed = bip39.mnemonicToSeedSync(mnemonic, "");
  const id = seedToOwnerId(seed);
  const encryptionKey = seedToEncryptionKey(seed);
  return { mnemonic, id, encryptionKey };
};
