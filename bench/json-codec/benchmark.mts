import { benchmarkRun, formatDuration } from "@paulmillr/jsbt/benchmark.js";
import { deepStrictEqual, strictEqual } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import {
  array,
  Boolean,
  createBuffer,
  decodeJsonValue,
  encodeJsonValue,
  getOrThrow,
  type InferType,
  JsonValue,
  object,
  PositiveInt,
  record,
  String,
} from "@evolu/common";
import { parseBenchmarkMode } from "../index.mts";

process.env.MSGPACKR_NATIVE_ACCELERATION_DISABLED = "true";
const { isNativeAccelerationEnabled, Packr } = await import("msgpackr");
strictEqual(isNativeAccelerationEnabled, false);

const batchSize = 1_000;
const repeatCount = 5;
const maxRegressionPercent = 10;
const benchmarkMethods = [
  "evoluEncode",
  "msgpackrEncode",
  "evoluDecode",
  "msgpackrDecode",
] as const;
type JsonCodecBenchmarkMethod = (typeof benchmarkMethods)[number];
const benchmarkScenarioNames = ["smallMixed", "largeNested"] as const;
type JsonCodecBenchmarkScenario = (typeof benchmarkScenarioNames)[number];

const benchmarkMode = parseBenchmarkMode({
  args: process.argv.slice(2),
  benchmarkName: "JSON binary codec",
});
const updateBaseline =
  benchmarkMode === "update-baseline" ||
  benchmarkMode === "force-update-baseline";

const JsonCodecBenchmarkEncodedValueLengths = object({
  smallMixed: PositiveInt,
  largeNested: PositiveInt,
});

const JsonCodecBenchmarkEnvironment = object({
  platform: String,
  arch: String,
  cpu: String,
  nodeVersion: String,
  msgpackrVersion: String,
  msgpackrNativeAcceleration: Boolean,
  batchSize: PositiveInt,
  repeatCount: PositiveInt,
  encodedValueLengths: JsonCodecBenchmarkEncodedValueLengths,
});
interface JsonCodecBenchmarkEnvironment extends InferType<
  typeof JsonCodecBenchmarkEnvironment
> {}

const JsonCodecBenchmarkScenarioMeasurements = object({
  evoluEncode: PositiveInt,
  msgpackrEncode: PositiveInt,
  evoluDecode: PositiveInt,
  msgpackrDecode: PositiveInt,
});
const JsonCodecBenchmarkMeasurements = object({
  smallMixed: JsonCodecBenchmarkScenarioMeasurements,
  largeNested: JsonCodecBenchmarkScenarioMeasurements,
});
interface JsonCodecBenchmarkMeasurements extends InferType<
  typeof JsonCodecBenchmarkMeasurements
> {}

const JsonCodecBenchmarkBaseline = object({
  environment: JsonCodecBenchmarkEnvironment,
  measurementsNs: JsonCodecBenchmarkMeasurements,
});
interface JsonCodecBenchmarkBaseline extends InferType<
  typeof JsonCodecBenchmarkBaseline
> {}

const JsonCodecBenchmarkBaselines = object({
  baselines: array(JsonCodecBenchmarkBaseline),
});
interface JsonCodecBenchmarkBaselines extends InferType<
  typeof JsonCodecBenchmarkBaselines
> {}

const PackageJson = record(String, JsonValue);

const baselinesUrl = new URL("./baselines.json", import.meta.url);
const baselines = getOrThrow(
  JsonCodecBenchmarkBaselines.fromUnknown(
    JSON.parse(await readFile(baselinesUrl, "utf8")),
  ),
);
const msgpackrPackageUrl = new URL(
  "./package.json",
  import.meta.resolve("msgpackr"),
);
const msgpackrPackage = getOrThrow(
  PackageJson.fromUnknown(
    JSON.parse(await readFile(msgpackrPackageUrl, "utf8")),
  ),
);
const msgpackrVersion = getOrThrow(String.fromUnknown(msgpackrPackage.version));

const labels = {
  evoluEncode: "Evolu encode",
  msgpackrEncode: "msgpackr encode",
  evoluDecode: "Evolu decode",
  msgpackrDecode: "msgpackr decode",
} satisfies Record<JsonCodecBenchmarkMethod, string>;

interface JsonCodecBenchmarkResult {
  readonly scenario: JsonCodecBenchmarkScenario;
  readonly method: JsonCodecBenchmarkMethod;
  readonly durationNs: bigint;
}

const benchmarkScenarios: ReadonlyArray<{
  readonly name: JsonCodecBenchmarkScenario;
  readonly label: string;
  readonly fixture: JsonValue;
}> = [
  {
    name: "smallMixed",
    label: "Small mixed object",
    // Adapted from msgpackr 2.0.5 tests/example5.json, used by
    // tests/benchmark.js.
    fixture: getOrThrow(
      JsonValue.fromUnknown({
        name: "test",
        greeting: "Hello, World!",
        flag: true,
        littleNum: 3,
        biggerNum: 32254435,
        decimal: 1.33,
        bigDecimal: 3.5522e35,
        negative: -54,
        aNull: null,
        more: "another string",
      }),
    ),
  },
  {
    name: "largeNested",
    label: "Large nested object",
    // msgpackr 2.0.5 tests/example4.json, used by tests/benchmark.cjs.
    fixture: getOrThrow(
      JsonValue.fromUnknown(
        JSON.parse(
          await readFile(new URL("./example4.json", import.meta.url), "utf8"),
        ),
      ),
    ),
  },
];

const packr = new Packr({ variableMapSize: true, useRecords: false });
const benchmarkResults: Array<JsonCodecBenchmarkResult> = [];
const encodedValueLengths: Partial<Record<JsonCodecBenchmarkScenario, number>> =
  {};
const batchSizeBigInt = BigInt(batchSize);

process.stderr.write(
  `JSON binary codec benchmark (${benchmarkScenarios.length} scenarios, ${batchSize.toLocaleString()} values per batch, ${repeatCount} repeats)\n`,
);

for (const scenario of benchmarkScenarios) {
  const evoluEncodedValueBuffer = createBuffer();
  encodeJsonValue(evoluEncodedValueBuffer, scenario.fixture);
  const evoluEncodedValue = evoluEncodedValueBuffer.unwrap();
  const msgpackrEncodedValue = new Uint8Array(packr.pack(scenario.fixture));
  deepStrictEqual(evoluEncodedValue, msgpackrEncodedValue);
  encodedValueLengths[scenario.name] = evoluEncodedValue.length;

  const encodedBatch = new Uint8Array(evoluEncodedValue.length * batchSize);
  for (let index = 0; index < batchSize; index++) {
    encodedBatch.set(evoluEncodedValue, index * evoluEncodedValue.length);
  }

  const evoluEncodeBuffer = createBuffer();
  const msgpackrEncodeBuffer = createBuffer();
  let evoluDecodedValue: JsonValue = null;
  let msgpackrDecodedValue: unknown;

  const callbacks = {
    evoluEncode: (): number => {
      evoluEncodeBuffer.reset();
      for (let index = 0; index < batchSize; index++) {
        encodeJsonValue(evoluEncodeBuffer, scenario.fixture);
      }
      return evoluEncodeBuffer.getLength();
    },
    msgpackrEncode: (): number => {
      msgpackrEncodeBuffer.reset();
      for (let index = 0; index < batchSize; index++) {
        msgpackrEncodeBuffer.extend(packr.pack(scenario.fixture));
      }
      return msgpackrEncodeBuffer.getLength();
    },
    evoluDecode: (): number => {
      const buffer = createBuffer(encodedBatch);
      for (let index = 0; index < batchSize; index++) {
        evoluDecodedValue = decodeJsonValue(buffer);
      }
      return batchSize;
    },
    msgpackrDecode: (): number => {
      const bytes = new Uint8Array(encodedBatch);
      packr.unpackMultiple(bytes, (decoded: unknown) => {
        msgpackrDecodedValue = decoded;
      });
      return batchSize;
    },
  } satisfies Record<JsonCodecBenchmarkMethod, () => unknown>;

  strictEqual(callbacks.evoluEncode(), encodedBatch.length);
  deepStrictEqual(evoluEncodeBuffer.unwrap(), encodedBatch);
  strictEqual(callbacks.msgpackrEncode(), encodedBatch.length);
  deepStrictEqual(msgpackrEncodeBuffer.unwrap(), encodedBatch);
  strictEqual(callbacks.evoluDecode(), batchSize);
  deepStrictEqual(evoluDecodedValue, scenario.fixture);
  strictEqual(callbacks.msgpackrDecode(), batchSize);
  deepStrictEqual(msgpackrDecodedValue, scenario.fixture);

  process.stderr.write(`\n# ${scenario.label}\n`);

  for (const method of benchmarkMethods) {
    let fastestDurationNs: bigint | undefined;

    for (let repeat = 1; repeat <= repeatCount; repeat++) {
      const result = await benchmarkRun(callbacks[method]);
      const durationNs =
        (result.stats.mean + batchSizeBigInt / 2n) / batchSizeBigInt;
      if (durationNs <= 0n) {
        throw new Error(`${labels[method]} measured a non-positive duration.`);
      }
      if (fastestDurationNs === undefined || durationNs < fastestDurationNs) {
        fastestDurationNs = durationNs;
      }
      process.stderr.write(
        `${labels[method]} run ${repeat}: ${formatDuration(durationNs)} per value\n`,
      );
    }

    if (fastestDurationNs === undefined) {
      throw new Error(`${labels[method]} produced no measurements.`);
    }

    benchmarkResults.push({
      scenario: scenario.name,
      method,
      durationNs: fastestDurationNs,
    });
  }
}

strictEqual(
  benchmarkResults.length,
  benchmarkMethods.length * benchmarkScenarios.length,
);

const environment = getOrThrow(
  JsonCodecBenchmarkEnvironment.fromUnknown({
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    nodeVersion: process.versions.node,
    msgpackrVersion,
    msgpackrNativeAcceleration: isNativeAccelerationEnabled,
    batchSize,
    repeatCount,
    encodedValueLengths: getOrThrow(
      JsonCodecBenchmarkEncodedValueLengths.fromUnknown(encodedValueLengths),
    ),
  }),
);
const existingBaseline = baselines.baselines.find(
  (baseline) =>
    baseline.environment.platform === environment.platform &&
    baseline.environment.arch === environment.arch &&
    baseline.environment.cpu === environment.cpu &&
    baseline.environment.nodeVersion === environment.nodeVersion &&
    baseline.environment.msgpackrVersion === environment.msgpackrVersion &&
    baseline.environment.msgpackrNativeAcceleration ===
      environment.msgpackrNativeAcceleration &&
    baseline.environment.batchSize === environment.batchSize &&
    baseline.environment.repeatCount === environment.repeatCount &&
    benchmarkScenarioNames.every(
      (scenario) =>
        baseline.environment.encodedValueLengths[scenario] ===
        environment.encodedValueLengths[scenario],
    ),
);

const formatChange = (durationNs: bigint, baselineDurationNs: bigint) => {
  const scale = 10_000n;
  const scaledRatio =
    (durationNs * scale + baselineDurationNs - 1n) / baselineDurationNs;
  const change = Number(scaledRatio - scale) / 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
};

process.stderr.write(
  `\n# Overall\n${environment.cpu}; ${environment.platform} ${environment.arch}; Node ${environment.nodeVersion}; msgpackr ${environment.msgpackrVersion}; native acceleration ${environment.msgpackrNativeAcceleration ? "enabled" : "disabled"}\n`,
);

const regressions: Array<string> = [];
for (const scenario of benchmarkScenarios) {
  const scenarioResults = benchmarkResults.filter(
    (result) => result.scenario === scenario.name,
  );
  const durationsByMethod = Object.fromEntries(
    scenarioResults.map((result) => [result.method, result.durationNs]),
  ) as Record<JsonCodecBenchmarkMethod, bigint>;

  process.stderr.write(`\n## ${scenario.label}\n`);

  for (const result of scenarioResults) {
    const baselineMeasurement =
      existingBaseline?.measurementsNs[result.scenario][result.method];
    const baselineDuration =
      baselineMeasurement === undefined
        ? undefined
        : BigInt(baselineMeasurement);
    const change =
      baselineDuration === undefined
        ? ""
        : `, baseline ${formatDuration(baselineDuration)}, ${formatChange(result.durationNs, baselineDuration)}`;
    const comparison =
      result.method === "evoluEncode"
        ? `, ${formatChange(result.durationNs, durationsByMethod.msgpackrEncode)} vs msgpackr`
        : result.method === "evoluDecode"
          ? `, ${formatChange(result.durationNs, durationsByMethod.msgpackrDecode)} vs msgpackr`
          : "";
    process.stderr.write(
      `${labels[result.method]}: ${formatDuration(result.durationNs)} per value, ${(1_000_000_000n / result.durationNs).toLocaleString()} values/sec${comparison}${change}\n`,
    );

    if (
      baselineDuration !== undefined &&
      result.durationNs * 100n >
        baselineDuration * BigInt(100 + maxRegressionPercent)
    ) {
      regressions.push(
        `${scenario.label} ${labels[result.method]} ${formatChange(result.durationNs, baselineDuration)}`,
      );
    }
  }
}

if (existingBaseline) {
  if (regressions.length > 0) {
    if (benchmarkMode === "force-update-baseline") {
      process.stderr.write(
        `\nForcing JSON binary codec baseline update despite regressions exceeding ${maxRegressionPercent}%: ${regressions.join(", ")}\n`,
      );
    } else {
      throw new Error(
        `JSON binary codec performance regression exceeded ${maxRegressionPercent}%: ${regressions.join(", ")}`,
      );
    }
  } else {
    process.stderr.write(
      `\nJSON binary codec benchmark passed (maximum regression ${maxRegressionPercent}%).\n`,
    );
  }
} else if (updateBaseline) {
  process.stderr.write(
    "\nNo JSON binary codec baseline matches this environment; creating one.\n",
  );
}

const nextBaseline: JsonCodecBenchmarkBaseline = {
  environment,
  measurementsNs: getOrThrow(
    JsonCodecBenchmarkMeasurements.fromUnknown(
      Object.fromEntries(
        benchmarkScenarios.map((scenario) => [
          scenario.name,
          Object.fromEntries(
            benchmarkResults
              .filter((result) => result.scenario === scenario.name)
              .map((result) => [result.method, Number(result.durationNs)]),
          ),
        ]),
      ),
    ),
  ),
};

if (updateBaseline) {
  const baselineIndex = baselines.baselines.findIndex(
    (baseline) => baseline === existingBaseline,
  );
  const nextBaselines = [...baselines.baselines];
  if (baselineIndex === -1) nextBaselines.push(nextBaseline);
  else nextBaselines[baselineIndex] = nextBaseline;
  await writeFile(
    baselinesUrl,
    `${JSON.stringify({ baselines: nextBaselines } satisfies JsonCodecBenchmarkBaselines, null, 2)}\n`,
  );
  process.stderr.write("\nUpdated JSON binary codec benchmark baseline\n");
} else if (!existingBaseline) {
  throw new Error(
    `JSON binary codec benchmark cannot check regressions because no baseline matches this environment. Add this entry to bench/json-codec/baselines.json:\n${JSON.stringify(nextBaseline, null, 2)}`,
  );
}
