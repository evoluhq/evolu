import { assertEqual } from "@evolu/common";
import { describe, it } from "node:test";
import { compareMeasurements } from "./baseline.mts";
import type { DirectionDiagnostics, ScenarioMeasurement } from "./workload.mts";

const direction: DirectionDiagnostics = {
  bytes: 100,
  maxFrameBytes: 100,
  rangesBytes: 10,
  maxRangesBytes: 10,
  messages: 1,
  changeBytes: 50,
  skipRanges: 0,
  fingerprintRanges: 1,
  timestampsRanges: 0,
  listedTimestamps: 0,
};

const measurement: ScenarioMeasurement = {
  workload: {
    rangesMaxSize: null,
    pushMessages: 0,
    client: { rows: 2, changeBytes: 300, sha256: "0123456789abcdef" },
    relay: { rows: 1, changeBytes: 150, sha256: "fedcba9876543210" },
  },
  outcome: "Converged",
  cost: {
    rounds: 3,
    bytes: 1_000,
    redundantMessages: 0,
    clientSqlStatements: 10,
    clientSqlRows: 20,
    relaySqlStatements: 30,
    relaySqlRows: 40,
  },
  diagnostics: {
    request: direction,
    response: direction,
    client: { iterate: 1 },
    relay: { iterate: 2 },
    changeTooLargeReports: 0,
    framesSha256: "00",
  },
};

describe("compareMeasurements", () => {
  it("finds no change in identical measurements", () => {
    assertEqual(
      compareMeasurements({ scenario: measurement }, { scenario: measurement }),
      {
        scenarioChanges: [],
        changes: [],
        workloadChanges: [],
        regressions: [],
        improvements: [],
      },
    );
  });

  it("reports added and removed scenarios without comparing them", () => {
    assertEqual(
      compareMeasurements(
        { kept: measurement, added: measurement },
        {
          kept: measurement,
          removed: { ...measurement, outcome: "RoundLimit" },
        },
      ),
      {
        scenarioChanges: ["added added", "removed removed"],
        changes: [],
        workloadChanges: [],
        regressions: [],
        improvements: [],
      },
    );
  });

  it("classifies cost increases as regressions and decreases as improvements", () => {
    const rounds = {
      scenario: "scenario",
      metric: "cost.rounds",
      baseline: 3,
      current: 4,
    };
    const bytes = {
      scenario: "scenario",
      metric: "cost.bytes",
      baseline: 1_000,
      current: 900,
    };
    const frames = {
      scenario: "scenario",
      metric: "diagnostics.framesSha256",
      baseline: "00",
      current: "01",
    };

    assertEqual(
      compareMeasurements(
        {
          scenario: {
            ...measurement,
            cost: { ...measurement.cost, rounds: 4, bytes: 900 },
            diagnostics: { ...measurement.diagnostics, framesSha256: "01" },
          },
        },
        { scenario: measurement },
      ),
      {
        scenarioChanges: [],
        changes: [rounds, bytes, frames],
        workloadChanges: [],
        regressions: [rounds],
        improvements: [bytes],
      },
    );
  });

  it("excludes cost increases of a changed workload from regressions", () => {
    const comparison = compareMeasurements(
      {
        changedWorkload: {
          ...measurement,
          workload: {
            ...measurement.workload,
            client: { ...measurement.workload.client, rows: 3 },
          },
          cost: { ...measurement.cost, bytes: 1_100 },
        },
        sameWorkload: {
          ...measurement,
          cost: { ...measurement.cost, bytes: 1_100 },
        },
      },
      { changedWorkload: measurement, sameWorkload: measurement },
    );

    assertEqual(comparison.workloadChanges, [
      {
        scenario: "changedWorkload",
        metric: "workload.client.rows",
        baseline: 2,
        current: 3,
      },
    ]);
    assertEqual(comparison.regressions, [
      {
        scenario: "sameWorkload",
        metric: "cost.bytes",
        baseline: 1_000,
        current: 1_100,
      },
    ]);
  });

  it("excludes cost decreases of a changed workload from improvements", () => {
    const comparison = compareMeasurements(
      {
        changedWorkload: {
          ...measurement,
          workload: {
            ...measurement.workload,
            client: { ...measurement.workload.client, rows: 3 },
          },
          cost: { ...measurement.cost, bytes: 900 },
        },
      },
      { changedWorkload: measurement },
    );

    assertEqual(comparison.improvements, []);
  });

  it("reports a metric missing on one side as a change only", () => {
    assertEqual(
      compareMeasurements(
        {
          scenario: {
            ...measurement,
            diagnostics: {
              ...measurement.diagnostics,
              client: { iterate: 1, readDbChange: 2 },
            },
          },
        },
        { scenario: measurement },
      ),
      {
        scenarioChanges: [],
        changes: [
          {
            scenario: "scenario",
            metric: "diagnostics.client.readDbChange",
            baseline: undefined,
            current: 2,
          },
        ],
        workloadChanges: [],
        regressions: [],
        improvements: [],
      },
    );
  });
});
