import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRunReactNativeNightly } from "./select-react-native-nightly.mts";

const selectAt = (event: string, repository: string, at: string): boolean =>
  shouldRunReactNativeNightly({ event, repository, now: new Date(at) });

describe("shouldRunReactNativeNightly", () => {
  for (const [time, expected] of [
    ["00:00:00", true],
    ["06:59:59", true],
    ["07:00:00", false],
    ["07:59:59", false],
    ["08:00:00", false],
    ["12:00:00", false],
    ["16:59:59", false],
    ["17:00:00", true],
    ["20:17:00", true],
    ["23:59:59", true],
  ] as const)
    it(`allows scheduled macOS jobs at ${time} UTC: ${expected}`, () => {
      assert.equal(
        selectAt("schedule", "evoluhq/evolu", `2026-11-27T${time}Z`),
        expected,
      );
    });

  for (const time of ["00:00:00", "10:30:00", "20:17:00"])
    it(`allows a manual upstream dispatch at ${time} UTC`, () => {
      assert.equal(
        selectAt("workflow_dispatch", "evoluhq/evolu", `2026-11-27T${time}Z`),
        true,
      );
    });

  for (const event of ["schedule", "workflow_dispatch"])
    it(`never starts fork macOS jobs on ${event}`, () => {
      assert.equal(
        selectAt(event, "godara-alt/evolu", "2026-11-27T20:17:00Z"),
        false,
      );
    });

  for (const event of ["push", "pull_request", "merge_group"])
    it(`never selects nightly jobs on ${event}`, () => {
      assert.equal(
        selectAt(event, "evoluhq/evolu", "2026-11-27T20:17:00Z"),
        false,
      );
    });
});
