import { createHash } from "sha256-uint8array";
import { Mnemonic } from "./model.js";
import { defaultMnemonicWordList } from "./validateMnemonic.js";

const getRandomBytes = (length: number): Uint8Array => {
  const randomBytesArray = new Uint8Array(length);
  // eslint-disable-next-line functional/no-loop-statement, functional/no-let
  for (let i = 0; i < length; i += 65536) {
    crypto.getRandomValues(
      randomBytesArray.subarray(i, i + Math.min(length - i, 65536))
    );
  }
  return randomBytesArray;
};

const hexToBytes = (hexString: string): Uint8Array =>
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  new Uint8Array(hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

const lpad = (str: string, padString: string, length: number): string => {
  // eslint-disable-next-line functional/no-loop-statement
  while (str.length < length) {
    // eslint-disable-next-line no-param-reassign
    str = padString + str;
  }
  return str;
};

const bytesToBinary = (bytes: readonly number[]): string =>
  bytes.map((x) => lpad(x.toString(2), "0", 8)).join("");

const deriveChecksumBits = (entropy: Uint8Array): string => {
  const ENT = entropy.length * 8;
  const CS = ENT / 32;

  const hash = createHash().update(entropy).digest();

  return bytesToBinary(Array.from(hash)).slice(0, CS);
};

const binaryToByte = (bin: string): number => parseInt(bin, 2);

const entropyToMnemonic = (entropyInput: string | Uint8Array): string => {
  const entropy =
    typeof entropyInput === "string" ? hexToBytes(entropyInput) : entropyInput;

  if (entropy.length < 16) {
    // eslint-disable-next-line functional/no-throw-statement
    throw new Error("INVALID_ENTROPY");
  }
  if (entropy.length > 32) {
    // eslint-disable-next-line functional/no-throw-statement
    throw new Error("INVALID_ENTROPY");
  }
  if (entropy.length % 4 !== 0) {
    // eslint-disable-next-line functional/no-throw-statement
    throw new Error("INVALID_ENTROPY");
  }

  const entropyBits = bytesToBinary(Array.from(entropy));
  const checksumBits = deriveChecksumBits(entropy);

  const bits = entropyBits + checksumBits;
  const chunks = bits.match(/(.{1,11})/g);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const words = chunks!.map((binary) => {
    const index = binaryToByte(binary);
    return defaultMnemonicWordList[index];
  });

  return words.join(" ");
};

// Extracted from bitcoinjs/bip39.
// https://github.com/bitcoinjs/bip39/issues/169#issuecomment-974191980
export const generateMnemonic = (strength = 128): Mnemonic => {
  const bytes = getRandomBytes(strength / 8);
  return entropyToMnemonic(bytes) as Mnemonic;
};
