import { assertEqual, assertThrowsInstanceOf, assertTrue } from "@evolu/common";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  readmeToBearSslPin,
  lsRemoteToLatestTag,
  readmeToMonocypherPin,
  packageJsonToPin,
  workloadToWaSqlitePin,
  pinsToReport,
  downloadPageToSqliteVersion,
} from "./check-upstream-pins.mts";

const root = new URL("../", import.meta.url);
const readme = (path: string) =>
  readFileSync(new URL(`packages/sqlite-core/vendor/${path}`, root), "utf8");

describe("check-upstream-pins.mts", () => {
  it("reads SQLite's latest release from the source zip's line on the download page", () => {
    const page = [
      "<!-- Download product data for scripts to read",
      "PRODUCT,3.55.0,2026/sqlite-amalgamation-3550000.zip,2900000,abc",
      "PRODUCT,3.55.0,2026/sqlite-src-3550000.zip,14280000,def",
      "-->",
    ].join("\n");

    assertEqual(downloadPageToSqliteVersion(page), "3.55.0");
    assertThrowsInstanceOf(
      () => downloadPageToSqliteVersion("<html></html>"),
      Error,
    );
  });

  it("reads the highest release tag from git ls-remote", () => {
    const tags = [
      "a1\trefs/tags/3.1.3",
      "b2\trefs/tags/4.0.10",
      "c3\trefs/tags/4.0.9",
      "d4\trefs/tags/4.0.10^{}",
      "e5\trefs/tags/5.0.0-rc1",
    ].join("\n");

    assertEqual(lsRemoteToLatestTag(tags), "4.0.10");
    assertThrowsInstanceOf(() => lsRemoteToLatestTag(""), Error);
  });

  it("reads release tags with a v prefix, as msgpackr names them", () => {
    const tags = [
      "a1\trefs/tags/v1.12.1",
      "b2\trefs/tags/v2.1.3",
      "c3\trefs/tags/v2.1.10",
      "d4\trefs/tags/v2.1.10^{}",
    ].join("\n");

    assertEqual(lsRemoteToLatestTag(tags), "2.1.10");
  });

  it("reads release tags with a build number, as @sqlite.org/sqlite-wasm names them", () => {
    const tags = [
      "a1\trefs/tags/3.53.4-build2",
      "b2\trefs/tags/3.54.1-build2",
      "c3\trefs/tags/3.54.1-build10",
      "d4\trefs/tags/3.54.0-build9",
    ].join("\n");

    assertEqual(lsRemoteToLatestTag(tags), "3.54.1-build10");
  });

  it("reads the versions the benchmarks' package.json files pin exactly", () => {
    const packageJson = (path: string) =>
      readFileSync(new URL(path, root), "utf8");

    for (const [path, name] of [
      ["package.json", "msgpackr"],
      ["bench/sqlite-comparison/package.json", "better-sqlite3"],
      ["bench/sqlite-comparison/package.json", "@sqlite.org/sqlite-wasm"],
      [
        "bench/sqlite-comparison/react-native/app/package.json",
        "@op-engineering/op-sqlite",
      ],
    ]) {
      assertTrue(
        /^\d+\.\d+\.\d+(?:-build\d+)?$/u.test(
          packageJsonToPin(packageJson(path), name),
        ),
      );
    }
    assertThrowsInstanceOf(
      () => packageJsonToPin('{ "msgpackr": "^2.1.3" }', "msgpackr"),
      Error,
    );
    assertThrowsInstanceOf(
      () => packageJsonToPin('{ "xmsgpackr": "2.1.3" }', "msgpackr"),
      Error,
    );
  });

  it("reads the wa-sqlite commit the SQLite comparison reads its workloads from", () => {
    assertTrue(
      /^[0-9a-f]{40}$/u.test(
        workloadToWaSqlitePin(
          readFileSync(
            new URL("bench/sqlite-comparison/workload.mts", root),
            "utf8",
          ),
        ),
      ),
    );
    assertThrowsInstanceOf(() => workloadToWaSqlitePin(""), Error);
  });

  it("reads the vendored pins from the vendor READMEs", () => {
    assertTrue(
      /^[0-9a-f]{40}$/u.test(readmeToBearSslPin(readme("bearssl/README.md"))),
    );
    assertTrue(
      /^\d+\.\d+\.\d+$/u.test(
        readmeToMonocypherPin(readme("monocypher/README.md")),
      ),
    );
    assertThrowsInstanceOf(() => readmeToBearSslPin(""), Error);
    assertThrowsInstanceOf(() => readmeToMonocypherPin(""), Error);
  });

  it("reports the pins behind their upstreams, or that all are current", () => {
    const sqlite = {
      name: "SQLite",
      pinned: "3.54.1",
      latest: "3.54.1",
      file: "packages/sqlite-core/scripts/sqlite-source.mts",
    };
    const monocypher = {
      name: "Monocypher",
      pinned: "4.0.3",
      latest: "4.1.0",
      file: "packages/sqlite-core/vendor/monocypher/README.md",
    };

    assertEqual(
      pinsToReport([sqlite, monocypher]),
      [
        "| Pin | Pinned | Latest | File |",
        "| --- | --- | --- | --- |",
        "| Monocypher | 4.0.3 | 4.1.0 | `packages/sqlite-core/vendor/monocypher/README.md` |",
        "",
        "SQLite is current.",
      ].join("\n"),
    );
    assertEqual(
      pinsToReport([sqlite]),
      "All upstream pins are current: SQLite.",
    );
  });

  it("links the latest version of a pin behind to what changed since the pin", () => {
    const msgpackr = {
      name: "msgpackr",
      pinned: "2.1.3",
      latest: "2.1.4",
      file: "package.json",
      changes: "https://github.com/kriszyp/msgpackr/compare/v2.1.3...v2.1.4",
    };

    assertEqual(
      pinsToReport([msgpackr]),
      [
        "| Pin | Pinned | Latest | File |",
        "| --- | --- | --- | --- |",
        "| msgpackr | 2.1.3 | [2.1.4](https://github.com/kriszyp/msgpackr/compare/v2.1.3...v2.1.4) | `package.json` |",
      ].join("\n"),
    );
    assertEqual(
      pinsToReport([{ ...msgpackr, latest: "2.1.3" }]),
      "All upstream pins are current: msgpackr.",
    );
  });
});
