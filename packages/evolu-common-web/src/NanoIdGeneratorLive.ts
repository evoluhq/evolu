import { createNanoIdGeneratorLive } from "@evolu/common";
import { customAlphabet, nanoid } from "nanoid";

export const NanoIdGeneratorLive = createNanoIdGeneratorLive(
  customAlphabet,
  nanoid,
);
