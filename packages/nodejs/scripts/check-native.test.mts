import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertThrows,
} from "@evolu/common";
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
import { checkNativeSqlite, packNativeSqlite } from "./check-native.mts";

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
