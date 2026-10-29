import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertThrows,
  assertTrue,
  emptyPrototype,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  isMusl,
  loadNativeSqlite,
  nativeSqliteTarget,
} from "../src/NativeSqlite.ts";
import { buildNativeSqlite } from "./build-native.mts";
import {
  checkLoadedNativeSqlite,
  checkNativeSqlite,
  knownAnswer,
  packNativeSqlite,
  skiplistAnswer,
} from "./check-native.mts";

// The addon the load check loads.
await buildNativeSqlite();

/** A Mach-O header with one LC_BUILD_VERSION whose minos is `minos`. */
const machO = ({
  cpuType = 0x0100000c,
  fileType = 8,
  minos = 0x000d0500,
}: {
  cpuType?: number;
  fileType?: number;
  minos?: number;
} = {}): Uint8Array => {
  const bytes = new Uint8Array(32 + 24);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(4, cpuType, true);
  view.setUint32(12, fileType, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 24, true);
  view.setUint32(32, 0x32, true);
  view.setUint32(36, 24, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, minos, true);
  return bytes;
};

/** An ELF header for `machine` whose dynamic strings are `strings`. */
const elf = (machine: number, strings: ReadonlyArray<string>): Uint8Array => {
  const tail = new TextEncoder().encode(`\0${strings.join("\0")}\0`);
  const bytes = new Uint8Array(64 + tail.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x7f454c46, false);
  bytes[4] = 2;
  view.setUint16(18, machine, true);
  bytes.set(tail, 64);
  return bytes;
};

const assertFails = (check: () => void, message: string): void => {
  assertThrows(check, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });
};

test("the scripts that build and check the addon import, at run time, only Node.js's own modules and the repository's files, which CI runs them with alone", () => {
  // A child process imports both, with a hook that refuses any other
  // specifier, as an import of a package would fail where nothing is
  // installed, and prints the files they imported.
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { registerHooks } from "node:module";
        const imported = [];
        registerHooks({
          resolve: (specifier, context, nextResolve) => {
            if (!/^(?:node:|\\.|file:)/u.test(specifier))
              throw new Error(context.parentURL + " imports " + specifier);
            const resolved = nextResolve(specifier, context);
            imported.push(resolved.url);
            return resolved;
          },
        });
        for (const script of process.argv.slice(1)) await import(script);
        console.log(JSON.stringify(imported));
      `,
      new URL("build-native.mts", import.meta.url).href,
      new URL("check-native.mts", import.meta.url).href,
    ],
    { encoding: "utf8" },
  );

  assertEqual([child.status, child.stderr], [0, ""]);
  // The loader and its row builder among them.
  const imported = JSON.parse(child.stdout) as ReadonlyArray<string>;
  assertEqual(
    ["NativeSqlite.ts", "NativeSqliteRows.ts"].map((name) =>
      imported.includes(new URL(`../src/${name}`, import.meta.url).href),
    ),
    [true, true],
  );
});

test("a macOS addon must be a 64-bit Mach-O bundle for its CPU that runs on macOS 13.5", () => {
  checkNativeSqlite("darwin-arm64", machO());
  checkNativeSqlite("darwin-x64", machO({ cpuType: 0x01000007 }));

  assertFails(
    () => checkNativeSqlite("darwin-arm64", elf(183, ["libc.so.6"])),
    "The addon for darwin-arm64 isn't a 64-bit Mach-O file.",
  );
  assertFails(
    () => checkNativeSqlite("darwin-x64", machO()),
    "The addon for darwin-x64 is for another CPU.",
  );
  assertFails(
    () => checkNativeSqlite("darwin-arm64", machO({ fileType: 6 })),
    "The addon for darwin-arm64 isn't a bundle.",
  );
  assertFails(
    () => checkNativeSqlite("darwin-arm64", machO({ minos: 0x001a0000 })),
    "The addon for darwin-arm64 runs on macOS 26.0, not 13.5.",
  );
  const withoutBuildVersion = machO();
  new DataView(withoutBuildVersion.buffer).setUint32(32, 0x19, true);
  assertFails(
    () => checkNativeSqlite("darwin-arm64", withoutBuildVersion),
    "The addon for darwin-arm64 has no build version.",
  );
});

test("a Linux addon must be a 64-bit ELF for its CPU that needs its C library alone", () => {
  checkNativeSqlite("linux-x64-gnu", elf(62, ["libc.so.6", "GLIBC_2.2.5"]));
  checkNativeSqlite("linux-arm64-gnu", elf(183, ["libc.so.6", "GLIBC_2.17"]));
  checkNativeSqlite("linux-x64-musl", elf(62, ["libc.musl-x86_64.so.1"]));
  checkNativeSqlite("linux-arm64-musl", elf(183, ["libc.musl-aarch64.so.1"]));

  assertFails(
    () => checkNativeSqlite("linux-x64-gnu", machO()),
    "The addon for linux-x64-gnu isn't a 64-bit ELF file.",
  );
  assertFails(
    () => checkNativeSqlite("linux-arm64-gnu", elf(62, ["libc.so.6"])),
    "The addon for linux-arm64-gnu is for another CPU.",
  );
  assertFails(
    () =>
      checkNativeSqlite("linux-x64-gnu", elf(62, ["libc.musl-x86_64.so.1"])),
    "The addon for linux-x64-gnu doesn't need glibc alone.",
  );
  assertFails(
    () => checkNativeSqlite("linux-x64-musl", elf(62, ["libc.so.6"])),
    "The addon for linux-x64-musl doesn't need musl alone.",
  );
});

test("a glibc addon must need no symbol newer than glibc 2.28", () => {
  checkNativeSqlite(
    "linux-x64-gnu",
    elf(62, ["libc.so.6", "GLIBC_2.28", "GLIBC_2.3.4", "GLIBC_1.99"]),
  );

  for (const version of ["2.29", "2.34", "2.29.1", "3.0"])
    assertFails(
      () =>
        checkNativeSqlite(
          "linux-x64-gnu",
          elf(62, ["libc.so.6", `GLIBC_${version}`]),
        ),
      `The addon for linux-x64-gnu needs glibc ${version.split(".").slice(0, 2).join(".")}, newer than 2.28.`,
    );
});

// Not the header's check, whose glibc floor only the native jobs' AlmaLinux 8
// build meets, since an addon built on a newer glibc may need it.
test("the built addon passes the load check, whose known answer fails for a corrupted copy, another key or other rows", (t) => {
  const target = nativeSqliteTarget({
    platform: process.platform,
    arch: process.arch,
    isMusl,
  });
  assert(target !== null, "Expected a target.");
  const directory = mkdtempSync(join(tmpdir(), "evolu-known-answer-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const fixture = readFileSync(knownAnswer.path);
  // A bit of the last page's ciphertext, which only the query reads.
  const corrupted = join(directory, "corrupted.db");
  const corruptedBytes = Uint8Array.from(fixture);
  corruptedBytes[corruptedBytes.length - 100] ^= 1;
  writeFileSync(corrupted, corruptedBytes);
  // A database the addon encrypted with the key, whose row differs.
  const other = join(directory, "other.db");
  const writing = loadNativeSqlite({
    rowPrototype: emptyPrototype,
  }).openEncryptedFile(other, knownAnswer.key);
  writing.run("create table t (a text)", []);
  writing.run("insert into t values ('other')", []);
  writing.close();

  checkLoadedNativeSqlite(target);

  for (const [known, message] of [
    [
      { path: corrupted, key: knownAnswer.key },
      `The addon can't read ${corrupted}, a database another implementation encrypted.`,
    ],
    [
      { path: knownAnswer.path, key: new Uint8Array(32).fill(9) },
      `The addon can't read ${knownAnswer.path}, a database another implementation encrypted.`,
    ],
    [
      { path: other, key: knownAnswer.key },
      `The addon read [{"a":"other"}] from ${other}, a database another implementation encrypted.`,
    ],
  ] as const)
    assertFails(() => checkLoadedNativeSqlite(target, known), message);
  // Reading it left the fixture as it was.
  assertTrue(readFileSync(knownAnswer.path).equals(fixture));
});

/** Skiplist-fixture.json as the test changes it. */
interface Fixture {
  owners: Array<{
    ownerId: string;
    size: number;
    timestamps: Array<string>;
    fingerprints: Array<{ buckets: Array<number>; ranges: Array<string> }>;
    lowerBounds: Array<string>;
  }>;
  inserts: Array<string>;
  rows: Array<string>;
}

test("the load check's timestamp storage fails for an answer or a row the skiplist fixture doesn't record", (t) => {
  const target = nativeSqliteTarget({
    platform: process.platform,
    arch: process.arch,
    isMusl,
  });
  assert(target !== null, "Expected a target.");
  const directory = mkdtempSync(join(tmpdir(), "evolu-skiplist-answer-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const original = readFileSync(skiplistAnswer, "utf8");
  const { owners, inserts, rows } = JSON.parse(original) as Fixture;
  // The last of each, so a check that stops early fails too.
  const last = owners.length - 1;
  const owner = owners[last];
  const insert = inserts[inserts.length - 1];
  const otherInsert = `${insert.slice(0, -1)}${insert.endsWith("1") ? "0" : "1"}`;
  const row = rows.length - 1;
  const timestamp = owner.size - 1;
  const fingerprints = (ranges: ReadonlyArray<string>) =>
    ranges
      .map((range) => range.replace(" -", "0".repeat(32)).replace(" ", ""))
      .join("");
  const query = owner.fingerprints.length - 1;
  const { buckets, ranges } = owner.fingerprints[query];
  const otherRanges = [
    `${ranges[0].startsWith("0") ? "1" : "0"}${ranges[0].slice(1)}`,
    ...ranges.slice(1),
  ];
  const bound = owner.lowerBounds.length - 1;
  const [lowerBound, lowerBoundIndex] = owner.lowerBounds[bound].split(" ");

  for (const [change, what, actual, expected] of [
    [
      (fixture: Fixture) => {
        fixture.inserts[inserts.length - 1] = otherInsert;
      },
      `the insert ${otherInsert}`,
      Number(insert.at(-1)),
      Number(otherInsert.at(-1)),
    ],
    [
      (fixture: Fixture) => {
        fixture.rows.pop();
      },
      "the number of rows",
      rows.length,
      rows.length - 1,
    ],
    [
      (fixture: Fixture) => {
        fixture.rows[row] = `${rows[row]}0`;
      },
      `row ${row}`,
      rows[row],
      `${rows[row]}0`,
    ],
    [
      (fixture: Fixture) => {
        fixture.owners[last].size = owner.size + 1;
      },
      `the size of ${owner.ownerId}`,
      owner.size,
      owner.size + 1,
    ],
    [
      (fixture: Fixture) => {
        fixture.owners[last].timestamps[timestamp] = "0".repeat(32);
      },
      `the timestamp at ${timestamp} of ${owner.ownerId}`,
      owner.timestamps[timestamp],
      "0".repeat(32),
    ],
    [
      (fixture: Fixture) => {
        fixture.owners[last].fingerprints[query].ranges = otherRanges;
      },
      `the fingerprints of ${owner.ownerId} at ${buckets.join(" ")}`,
      fingerprints(ranges),
      fingerprints(otherRanges),
    ],
    [
      (fixture: Fixture) => {
        fixture.owners[last].lowerBounds[bound] = `${lowerBound} -`;
      },
      `the lower bound of ${lowerBound} of ${owner.ownerId}`,
      Number(lowerBoundIndex),
      null,
    ],
  ] as const) {
    const fixture = JSON.parse(original) as Fixture;
    change(fixture);
    const path = join(directory, "skiplist-fixture.json");
    writeFileSync(path, JSON.stringify(fixture));
    assertFails(
      () => checkLoadedNativeSqlite(target, knownAnswer, path),
      `Evolu's timestamp storage returned ${String(actual)} for ${what}, not ${String(expected)}.`,
    );
  }
});

/** The header of an addon each target's check passes. */
const addonByTarget = {
  "darwin-arm64": machO(),
  "darwin-x64": machO({ cpuType: 0x01000007 }),
  "linux-arm64-gnu": elf(183, ["libc.so.6", "GLIBC_2.17"]),
  "linux-arm64-musl": elf(183, ["libc.musl-aarch64.so.1"]),
  "linux-x64-gnu": elf(62, ["libc.so.6", "GLIBC_2.2.5"]),
  "linux-x64-musl": elf(62, ["libc.musl-x86_64.so.1"]),
};

/**
 * A package's `native` directory with the addons of `addons` and a `dist`
 * directory, both removed after the test.
 */
const setupPackage = (
  t: { after: (fn: () => void) => void },
  addons: Partial<Record<keyof typeof addonByTarget, Uint8Array>>,
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-nodejs-pack-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const native = join(directory, "native");
  for (const [target, bytes] of Object.entries(addons)) {
    mkdirSync(join(native, target), { recursive: true });
    writeFileSync(join(native, target, "evolu.node"), bytes);
  }
  return { native, dist: join(directory, "dist", "native") };
};

test("pack copies every target's addon into dist/native", (t) => {
  const { native, dist } = setupPackage(t, addonByTarget);

  packNativeSqlite({ native, dist });

  assertEqual(
    readdirSync(dist).toSorted(),
    Object.keys(addonByTarget).toSorted(),
  );
  for (const [target, bytes] of Object.entries(addonByTarget))
    assertEqual(
      new Uint8Array(readFileSync(join(dist, target, "evolu.node"))),
      bytes,
    );
});

test("pack fails, copying nothing, when an addon is missing or is for the other C library", (t) => {
  const { "linux-x64-musl": _missing, ...lacking } = addonByTarget;
  for (const [addons, message] of [
    [
      lacking,
      "native/ lacks the addons for linux-x64-musl, which CI builds, so the package can't be packed.",
    ],
    [
      { ...addonByTarget, "linux-x64-gnu": addonByTarget["linux-x64-musl"] },
      "The addon for linux-x64-gnu doesn't need glibc alone.",
    ],
  ] as const) {
    const { native, dist } = setupPackage(t, addons);

    assertFails(() => packNativeSqlite({ native, dist }), message);

    assertFalse(existsSync(dist));
  }
});
