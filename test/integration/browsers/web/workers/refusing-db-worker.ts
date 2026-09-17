/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { PositiveInt } from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import type {
  DbWorkerInit,
  DbWorkerInput,
  DbWorkerOutput,
} from "@evolu/common/local-first";
import {
  createMessagePort,
  createWorkerSelf,
} from "../../../../../packages/web/src/Worker.ts";

installPolyfills();

const worker = createWorkerSelf<DbWorkerInit>(self);
worker.onMessage = (message) => {
  using port = createMessagePort<DbWorkerOutput, DbWorkerInput>(message.port);
  port.postMessage({
    type: "LeaderRefused",
    name: message.name,
    error: {
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(2),
      supportedVersion: PositiveInt.orThrow(1),
    },
  });
  worker[Symbol.dispose]();
};
