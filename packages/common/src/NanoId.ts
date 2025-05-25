import { customAlphabet, nanoid, urlAlphabet } from "nanoid";

/**
 * Interface representing a NanoId library.
 *
 * It's useful for testing by allowing ID generation to be mocked, ensuring
 * consistent results.
 *
 * @see https://github.com/ai/nanoid
 *
 * ### Example
 *
 * ```ts
 * const foo = createFoo({
 *   ...createNanoIdLib(),
 *   ...createTime(),
 * });
 * ```
 */
export interface NanoIdLib {
  readonly urlAlphabet: string;

  readonly customAlphabet: (
    alphabet: string,
    defaultSize?: number,
  ) => (size?: number) => string;

  readonly nanoid: (size?: number) => string;
}

export interface NanoIdLibDep {
  readonly nanoIdLib: NanoIdLib;
}

export const createNanoIdLib = (): NanoIdLib => ({
  urlAlphabet,
  customAlphabet,
  nanoid,
});
