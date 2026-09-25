import { benchmarkRun } from "@paulmillr/jsbt/benchmark.js";
import { parentPort, workerData } from "node:worker_threads";
import { batchSize, createScenario, scenarioNames } from "./workload.mts";

// Each Worker has its own V8 isolate, so JIT feedback from one measured
// scenario cannot affect another.
const name = scenarioNames.find((scenarioName) => scenarioName === workerData);
if (name === undefined || parentPort === null) {
  throw new Error("The Type runtime benchmark worker needs a scenario name.");
}

const scenario = createScenario(name);
const { run } = scenario;
const result = await benchmarkRun(() => {
  for (let index = 0; index < batchSize; index++) run();
  return batchSize;
});
scenario.verify();

const batchSizeBigInt = BigInt(batchSize);
parentPort.postMessage(
  (result.stats.mean + batchSizeBigInt / 2n) / batchSizeBigInt,
);
