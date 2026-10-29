/**
 * The binding conformance suite of `@evolu/react-native` on the addon
 * `@evolu/nodejs` ships, as its `scripts/build-native.mts` builds it for a
 * release, without the test hooks of the addon the core's and
 * `@evolu/react-native`'s tests run it on.
 */
import { assertEqual, emptyPrototype } from "@evolu/common";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { nativeSqliteAbiVersion } from "../../../../packages/react-native/src/sqlite/Binding.ts";
import { describeBindingConformance } from "../../../../packages/react-native/test/bindingConformance.ts";
import { writeIllFormedNamesDatabase } from "../../../../packages/react-native/test/illFormedNames.ts";
import { buildNativeSqlite } from "../../../../packages/nodejs/scripts/build-native.mts";
import { loadNativeSqlite } from "../../../../packages/nodejs/src/NativeSqlite.ts";

await buildNativeSqlite();
const binding = loadNativeSqlite({ rowPrototype: emptyPrototype });
const directory = mkdtempSync(join(tmpdir(), "evolu-nodejs-conformance-"));
const illFormedNames = `${directory}-ill-formed-names.db`;
writeIllFormedNamesDatabase(illFormedNames);

after(() => {
  rmSync(directory, { recursive: true, force: true });
  rmSync(illFormedNames, { force: true });
});

describeBindingConformance({
  binding,
  // Both packages implement one binding.
  abiVersion: nativeSqliteAbiVersion,
  directory,
  illFormedNames,
  // Node-API's napi_is_array sees no array in a Proxy.
  acceptsProxyArrays: false,
  test,
  assertEqual,
});
