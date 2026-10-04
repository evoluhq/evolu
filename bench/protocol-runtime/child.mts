/**
 * One measurement of the protocol runtime benchmark: `node --expose-gc
 * bench/protocol-runtime/child.mts <root> <case>`.
 *
 * [`benchmark.mts`](./benchmark.mts) starts a fresh child process for each case
 * and repeat, with `NODE_ENV=production`, so Runs skip development-only checks
 * such as leak detection, as in a production bundle. The child loads every
 * Evolu module from `<root>`, the working tree or a snapshot of another commit,
 * and a load hook fails when it loads one from any other root. It statically
 * imports only Node.js modules, erased types, and modules that do the same. It
 * sends its {@link CaseResult} over the IPC channel, or prints it as JSON
 * without one.
 */
import { realpathSync } from "node:fs";
import {
  guardSourceRoot,
  loadModules,
  type RequiredExports,
  sendToParent,
} from "../protocol/child.mts";
import { measureMicro } from "./micro.mts";
import { measureReconcile } from "./reconcile.mts";
import {
  caseNames,
  type CaseResult,
  isMicroName,
  isReconcileScenarioName,
} from "./workload.mts";

const main = async (): Promise<void> => {
  const [rootArgument, caseName, ...rest] = process.argv.slice(2);
  if (rootArgument === undefined || caseName === undefined || rest.length > 0) {
    throw new Error(
      `Usage: node --expose-gc bench/protocol-runtime/child.mts <source root> <${caseNames.join(" | ")}>`,
    );
  }
  const root = realpathSync(rootArgument);
  guardSourceRoot(root, "protocol runtime");
  const modules = await loadModules(root, requiredExports);

  const measurement = isReconcileScenarioName(caseName)
    ? await measureReconcile(modules, caseName)
    : isMicroName(caseName)
      ? await measureMicro(modules, caseName)
      : null;
  if (measurement === null) throw new Error(`Unknown case ${caseName}.`);

  const result: CaseResult = {
    ...measurement,
    maxRssKiB: process.resourceUsage().maxRSS,
  };
  await sendToParent(result);
};

const requiredExports: RequiredExports = {
  common: [
    "createBuffer",
    "createRun",
    "createSqlite",
    "decodeLength",
    "decodeNonNegativeInt",
    "decodeRle",
    "Millis",
    "Name",
    "NonNegativeInt",
    "ok",
    "sql",
    "testCreateConsole",
  ],
  localFirst: [
    "applyProtocolMessageAsClient",
    "applyProtocolMessageAsRelay",
    "Counter",
    "createBaseSqliteStorageTables",
    "createProtocolBroadcastMessagesFromCrdtMessages",
    "createProtocolMessageForSync",
    "createProtocolMessageFromCrdtMessages",
    "createRelaySqliteStorage",
    "createRelayStorageTables",
    "createTimestampsBuffer",
    "DbChange",
    "decryptAndDecodeDbChange",
    "encodeAndEncryptDbChange",
    "InfiniteUpperBound",
    "NodeId",
    "ownerIdToOwnerIdBytes",
    "ProtocolErrorCode",
    "ProtocolMessageRangesMaxSize",
    "RangeType",
    "testAppOwner",
    "timestampBytesToFingerprint",
    "timestampToTimestampBytes",
    "zeroFingerprint",
  ],
};

if (import.meta.main) await main();
