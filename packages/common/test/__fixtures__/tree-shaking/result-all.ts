import {
  allResult,
  anyResult,
  done,
  err,
  getOrNull,
  getOrThrow,
  isErr,
  isOk,
  mapResult,
  ok,
  tryAsync,
  trySync,
} from "@evolu/common";

const keep = {
  allResult,
  anyResult,
  done,
  err,
  getOrNull,
  getOrThrow,
  isErr,
  isOk,
  mapResult,
  ok,
  tryAsync,
  trySync,
};

(
  globalThis as typeof globalThis & { __evoluTreeShaking?: unknown }
).__evoluTreeShaking = keep;
