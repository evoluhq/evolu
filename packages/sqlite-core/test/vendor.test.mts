import { assertEqual } from "@evolu/common";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";

const vendorDirectory = join(import.meta.dirname, "../vendor");

it("matches the vendored files and digests its READMEs list", () => {
  for (const library of ["bearssl", "monocypher"]) {
    const directory = join(vendorDirectory, library);
    const readme = readFileSync(join(directory, "README.md"), "utf8");
    // BearSSL's README lists `<digest>  <path>` lines, Monocypher's a table
    // row per file.
    const listed = [
      ...[...readme.matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gmu)].map(
        ([, digest, path]) => [path, digest],
      ),
      ...[...readme.matchAll(/^\| `([^`]+)` .*`([0-9a-f]{64})` /gmu)].map(
        ([, path, digest]) => [path, digest],
      ),
    ].toSorted(([a], [b]) => a.localeCompare(b));
    const vendored = readdirSync(directory, {
      recursive: true,
      encoding: "utf8",
    })
      .filter(
        (path) =>
          path !== "README.md" && statSync(join(directory, path)).isFile(),
      )
      .toSorted((a, b) => a.localeCompare(b))
      .map((path) => [
        path,
        createHash("sha256")
          .update(readFileSync(join(directory, path)))
          .digest("hex"),
      ]);

    assertEqual(vendored, listed);
  }
});
