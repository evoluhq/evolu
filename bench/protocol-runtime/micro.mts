/**
 * Times one micro benchmark in a child process.
 *
 * Each uses only public API present in every compared version. A call is one
 * batch, such as 1,000 encryptions. The child warms up, then measures calls,
 * each prepared outside its measured region, and verifies the last call's
 * output after measuring.
 */
import { createHash } from "node:crypto";
import type {
  Buffer as EvoluBuffer,
  NonEmptyReadonlyArray,
} from "@evolu/common";
import type {
  CrdtMessage,
  EncryptedCrdtMessage,
  Storage,
} from "@evolu/common/local-first";
import type { Modules } from "../protocol/child.mts";
import {
  broadcastMessageType,
  createFrameParser,
  type ParsedFrame,
} from "../protocol/frames.mts";
import {
  createTimestampFactory,
  createTypicalRows,
} from "../protocol/scenarios.mts";
import {
  createRandomBytesPool,
  fastestTimings,
  measureRule,
  type PassTimings,
  runPasses,
  startTiming,
  warmupRule,
} from "./measure.mts";
import {
  countCalls,
  createMemoryStorage,
  createMemoryStorageSnapshot,
} from "./memoryStorage.mts";
import type { Work } from "./timing.mts";
import {
  type CaseResult,
  createChangeInputs,
  createFrameWriter,
  createMaxSkipRangesRequest,
  createMaxTimestampsRangeRequest,
  createMessagesWithoutWriteKeyRequest,
  maxFrameBytes,
  type MicroName,
} from "./workload.mts";

export const measureMicro = async (
  modules: Modules,
  name: MicroName,
): Promise<Omit<CaseResult, "maxRssKiB">> => {
  await using micro = createMicro(modules, name);

  const pass = async (): Promise<PassTimings> => {
    micro.prepare();
    const end = startTiming();
    const output = micro.call();
    if (output instanceof Promise) await output;
    return { call: end() };
  };
  await runPasses(warmupRule, pass);
  const calls = await runPasses(measureRule, pass);
  const work = await micro.verify();
  const { call } = fastestTimings(calls);

  return {
    name,
    workloadSha256: micro.workloadSha256,
    sqliteVersion: null,
    work,
    cpuNs: { [name]: call.cpuNs },
    reportedCpuNs: {},
    wallNs: { [name]: call.wallNs },
    passes: calls.length,
  };
};

interface Micro extends AsyncDisposable {
  /** A SHA-256 of the inputs, computed by the harness. */
  readonly workloadSha256: string;
  /** Runs before each call, outside the measured region. */
  readonly prepare: () => void;
  /** The measured call, which keeps its output for verify. */
  readonly call: () => unknown;
  /** Checks the last call's output and describes the work it did. */
  readonly verify: () => Promise<Work> | Work;
}

const createMicro = (modules: Modules, name: MicroName): Micro => {
  const { common, localFirst } = modules;
  const owner = localFirst.testAppOwner;
  const ownerIdBytes = localFirst.ownerIdToOwnerIdBytes(owner.id);
  const createTimestamp = createTimestampFactory(modules);
  const parseFrame = createFrameParser(modules);

  const toCrdtMessages = (
    inputs: ReturnType<typeof createChangeInputs>,
  ): NonEmptyReadonlyArray<CrdtMessage> => {
    const messages = inputs.map(
      ({ id, title, millis, counter, nodeId }): CrdtMessage => ({
        timestamp: createTimestamp(millis, counter, nodeId),
        change: localFirst.DbChange.orThrow({
          table: "todo",
          id,
          values: { title },
          isInsert: true,
          isDelete: null,
        }),
      }),
    );
    const [first, ...rest] = messages;
    if (first === undefined) throw new Error("A micro benchmark needs input.");
    return [first, ...rest];
  };

  const hashOf = (...parts: ReadonlyArray<string | Uint8Array>) => {
    const hash = createHash("sha256").update(name);
    for (const part of parts) hash.update(part);
    return hash.digest("hex");
  };

  const parseOrThrow = (frame: Uint8Array, label: string): ParsedFrame => {
    if (frame.length > maxFrameBytes) {
      throw new Error(
        `${label} has ${frame.length} bytes, over ${maxFrameBytes}.`,
      );
    }
    try {
      return parseFrame(frame);
    } catch (error) {
      throw new Error(`${label} does not parse.`, { cause: error });
    }
  };

  const emptySnapshot = createMemoryStorageSnapshot(modules, []);
  // The production relay always passes broadcast, so it builds the broadcast
  // frame; only delivery is skipped.
  const relayOptions = {
    subscribe: () => undefined,
    unsubscribe: () => undefined,
    broadcast: () => undefined,
  };

  /** One long-lived relay Run over empty in-memory storage, as in production. */
  const createRelay = (storage: Storage) => {
    const console = common.testCreateConsole({ level: "warn" });
    const run = common.createRun({ storage, console });
    return {
      apply: (request: Uint8Array) =>
        run(localFirst.applyProtocolMessageAsRelay(request, relayOptions)),
      problems: () => console.getEntriesSnapshot().length,
      [Symbol.asyncDispose]: () => run[Symbol.asyncDispose](),
    };
  };

  const noDisposal = async () => {
    // Nothing to dispose.
  };

  switch (name) {
    case "encrypt-1000":
    case "decrypt-1000": {
      const inputs = createChangeInputs(51, 1_000);
      const messages = toCrdtMessages(inputs);
      const key = owner.encryptionKey;
      const nonceSeed = 52;
      const nonces = createRandomBytesPool(
        nonceSeed,
        messages.length * nonceBytes,
      );
      const encrypt = localFirst.encodeAndEncryptDbChange({
        randomBytes: nonces.randomBytes,
      });
      const encryptAll = () =>
        messages.map((message): EncryptedCrdtMessage => ({
          timestamp: message.timestamp,
          change: encrypt(message, key),
        }));
      const encrypted = encryptAll();
      const workloadSha256 = hashOf(JSON.stringify({ inputs, nonceSeed }));
      const encryptedBytes = encrypted.reduce(
        (sum, { change }) => sum + change.length,
        0,
      );

      /** Every change decrypts to its input. */
      const verifyDecrypted = (
        decrypted: ReadonlyArray<
          ReturnType<typeof localFirst.decryptAndDecodeDbChange>
        >,
      ) => {
        decrypted.forEach((result, index) => {
          if (
            !result.ok ||
            JSON.stringify(result.value) !==
              JSON.stringify(messages[index].change)
          ) {
            throw new Error(`${name} change ${index} does not round-trip.`);
          }
        });
      };

      if (name === "encrypt-1000") {
        let outputs: ReadonlyArray<EncryptedCrdtMessage> = [];
        return {
          workloadSha256,
          prepare: nonces.reset,
          call: () => {
            outputs = encryptAll();
          },
          verify: () => {
            // The same nonces must give the same bytes as before measuring.
            if (
              outputs.length !== encrypted.length ||
              outputs.some(
                ({ change }, index) =>
                  Buffer.compare(change, encrypted[index].change) !== 0,
              )
            ) {
              throw new Error(`${name} is not deterministic.`);
            }
            verifyDecrypted(
              outputs.map((message) =>
                localFirst.decryptAndDecodeDbChange(message, key),
              ),
            );
            return {
              changes: outputs.length,
              encryptedBytes,
              outputSha256: hashOf(...outputs.map(({ change }) => change)),
            };
          },
          [Symbol.asyncDispose]: noDisposal,
        };
      }

      let outputs: ReadonlyArray<
        ReturnType<typeof localFirst.decryptAndDecodeDbChange>
      > = [];
      return {
        workloadSha256,
        prepare: () => undefined,
        call: () => {
          outputs = encrypted.map((message) =>
            localFirst.decryptAndDecodeDbChange(message, key),
          );
        },
        verify: () => {
          verifyDecrypted(outputs);
          return { changes: outputs.length, encryptedBytes };
        },
        [Symbol.asyncDispose]: noDisposal,
      };
    }

    case "timestamps-buffer-5000": {
      const timestamps = createTypicalRows(modules, 1, 5_000).map(
        (row) => row.timestamp,
      );
      const writer = createFrameWriter();
      writer.timestamps(timestamps);
      const expected = writer.unwrap();
      let output: EvoluBuffer | null = null;
      return {
        workloadSha256: hashOf(expected),
        prepare: () => undefined,
        call: () => {
          const timestampsBuffer = localFirst.createTimestampsBuffer();
          for (const timestamp of timestamps) timestampsBuffer.add(timestamp);
          output = common.createBuffer();
          timestampsBuffer.append(output);
        },
        verify: () => {
          if (
            output === null ||
            Buffer.compare(output.unwrap(), expected) !== 0
          ) {
            throw new Error(`${name} encoded other bytes than the harness.`);
          }
          return { timestamps: timestamps.length, bytes: expected.length };
        },
        [Symbol.asyncDispose]: noDisposal,
      };
    }

    case "upload-builder-5000":
    case "broadcast-builder-5000": {
      const inputs = createChangeInputs(61, 5_000);
      const messages = toCrdtMessages(inputs);
      const randomSeed = 62;
      const randomBytes = createRandomBytesPool(
        randomSeed,
        messages.length * nonceBytes + 1_024,
      );
      const workloadSha256 = hashOf(JSON.stringify({ inputs, randomSeed }));

      if (name === "upload-builder-5000") {
        const build = localFirst.createProtocolMessageFromCrdtMessages({
          randomBytes: randomBytes.randomBytes,
        });
        let output: Uint8Array | null = null;
        return {
          workloadSha256,
          prepare: randomBytes.reset,
          call: () => {
            output = build(owner, messages);
          },
          verify: async () => {
            if (output === null) throw new Error(`${name} built nothing.`);
            const parsed = parseOrThrow(output, `The ${name} request`);
            if (parsed.messages === 0 || parsed.messages >= messages.length) {
              throw new Error(
                `The ${name} request holds ${parsed.messages} of ${messages.length} messages instead of filling one frame.`,
              );
            }
            // A relay accepts the request and stores every message.
            const storage = createMemoryStorage(
              modules,
              emptySnapshot,
              messages.length,
            );
            await using relay = createRelay(storage);
            const result = await relay.apply(output);
            const response = result.ok
              ? parseOrThrow(result.value.message, `The ${name} response`)
              : null;
            if (
              response?.errorCode !== localFirst.ProtocolErrorCode.NoError ||
              storage.getSize(ownerIdBytes) !== parsed.messages ||
              relay.problems() > 0
            ) {
              throw new Error(`A relay did not accept the ${name} request.`);
            }
            return {
              bytes: output.length,
              messages: parsed.messages,
              sha256: hashOf(output),
            };
          },
          [Symbol.asyncDispose]: noDisposal,
        };
      }

      const build = localFirst.createProtocolBroadcastMessagesFromCrdtMessages({
        randomBytes: randomBytes.randomBytes,
      });
      let output: ReadonlyArray<Uint8Array> = [];
      return {
        workloadSha256,
        prepare: randomBytes.reset,
        call: () => {
          output = build(owner, messages);
        },
        verify: () => {
          const parsed = output.map((frame, index) =>
            parseOrThrow(frame, `Broadcast ${index} of ${name}`),
          );
          const broadcastMessages = parsed.reduce(
            (sum, frame) => sum + frame.messages,
            0,
          );
          if (
            parsed.some(
              (frame) => frame.messageType !== broadcastMessageType,
            ) ||
            broadcastMessages !== messages.length
          ) {
            throw new Error(
              `${name} built ${broadcastMessages} broadcast messages instead of ${messages.length}.`,
            );
          }
          return {
            frames: output.length,
            bytes: output.reduce((sum, frame) => sum + frame.length, 0),
            sha256: hashOf(...output),
          };
        },
        [Symbol.asyncDispose]: noDisposal,
      };
    }

    case "relay-max-skip-ranges":
    case "relay-max-timestamps-range":
    case "relay-messages-without-write-key": {
      const request =
        name === "relay-max-skip-ranges"
          ? createMaxSkipRangesRequest(ownerIdBytes)
          : name === "relay-max-timestamps-range"
            ? createMaxTimestampsRangeRequest(ownerIdBytes)
            : createMessagesWithoutWriteKeyRequest(ownerIdBytes);
      const parsedRequest = parseOrThrow(request, `The ${name} request`);
      const counted = countCalls(
        createMemoryStorage(modules, emptySnapshot, 1),
      );
      const relay = createRelay(counted.storage);
      let output: Awaited<ReturnType<typeof relay.apply>> | null = null;
      const expectedErrorCode =
        name === "relay-messages-without-write-key"
          ? localFirst.ProtocolErrorCode.WriteKeyError
          : localFirst.ProtocolErrorCode.NoError;
      return {
        workloadSha256: hashOf(request),
        prepare: () => undefined,
        call: async () => {
          output = await relay.apply(request);
        },
        verify: () => {
          if (output === null || !output.ok) {
            throw new Error(`The relay rejected the ${name} request.`);
          }
          const response = parseOrThrow(
            output.value.message,
            `The ${name} response`,
          );
          const { writeMessages, validateWriteKey } = counted.counts();
          if (
            response.errorCode !== expectedErrorCode ||
            counted.storage.getSize(ownerIdBytes) !== 0 ||
            relay.problems() > 0 ||
            (name === "relay-messages-without-write-key" &&
              writeMessages + validateWriteKey > 0)
          ) {
            throw new Error(
              `The relay answered the ${name} request with error code ${response.errorCode}, or wrote, or logged a problem.`,
            );
          }
          return {
            requestBytes: request.length,
            rangesBytes: parsedRequest.rangesBytes,
            ranges:
              parsedRequest.skipRanges +
              parsedRequest.fingerprintRanges +
              parsedRequest.timestampsRanges,
            listedTimestamps: parsedRequest.listedTimestamps,
            messages: parsedRequest.messages,
            responseBytes: output.value.message.length,
            responseSha256: hashOf(output.value.message),
          };
        },
        [Symbol.asyncDispose]: async () => {
          await relay[Symbol.asyncDispose]();
        },
      };
    }
  }
};

const nonceBytes = 24;
