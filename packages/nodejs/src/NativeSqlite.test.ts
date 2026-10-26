import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertThrows,
  assertTrue,
  emptyPrototype,
  type NativeSqlite,
  type NativeSqliteDatabase,
} from "@evolu/common";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  configureNativeSqlite,
  createIsMusl,
  isMusl,
  loadNativeSqlite,
  nativeSqliteTarget,
  nativeSqliteTargets,
  nativeSqliteUrl,
} from "./NativeSqlite.ts";

const glibc = () => false;
const musl = () => true;

test("each platform Evolu ships SQLite for has its target, and Linux's names its C library", () => {
  assertEqual(
    [
      nativeSqliteTarget({ platform: "darwin", arch: "arm64", isMusl: glibc }),
      nativeSqliteTarget({ platform: "darwin", arch: "x64", isMusl: glibc }),
      nativeSqliteTarget({ platform: "linux", arch: "arm64", isMusl: glibc }),
      nativeSqliteTarget({ platform: "linux", arch: "arm64", isMusl: musl }),
      nativeSqliteTarget({ platform: "linux", arch: "x64", isMusl: glibc }),
      nativeSqliteTarget({ platform: "linux", arch: "x64", isMusl: musl }),
    ],
    [...nativeSqliteTargets],
  );
});

test("Windows, other systems and other CPUs have no target, and only Linux reads its C library", () => {
  let reads = 0;
  const countedMusl = () => {
    reads++;
    return false;
  };

  assertEqual(
    [
      nativeSqliteTarget({
        platform: "win32",
        arch: "x64",
        isMusl: countedMusl,
      }),
      nativeSqliteTarget({
        platform: "win32",
        arch: "arm64",
        isMusl: countedMusl,
      }),
      nativeSqliteTarget({
        platform: "freebsd",
        arch: "x64",
        isMusl: countedMusl,
      }),
      nativeSqliteTarget({
        platform: "linux",
        arch: "arm",
        isMusl: countedMusl,
      }),
      nativeSqliteTarget({
        platform: "darwin",
        arch: "ia32",
        isMusl: countedMusl,
      }),
    ],
    [null, null, null, null, null],
  );
  assertEqual(reads, 0);
});

test("loading on a platform without a target throws an error naming it and the targets", () => {
  for (const [platform, name] of [
    [{ platform: "win32", arch: "x64", isMusl: glibc }, "win32-x64"],
    [{ platform: "linux", arch: "arm", isMusl: musl }, "linux-arm-musl"],
  ] as const)
    assertThrows(
      () => loadNativeSqlite({ rowPrototype: emptyPrototype, platform }),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(
          error.message,
          `@evolu/nodejs has no SQLite for ${name}. It ships Evolu's SQLite for darwin-arm64, darwin-x64, linux-arm64-gnu, linux-arm64-musl, linux-x64-gnu, linux-x64-musl.`,
        );
      },
    );
});

test("loading requires the addon of its target, and throws naming it when that can't load", () => {
  // A target of another system, which no build here writes.
  const [platform, target] =
    process.platform === "darwin"
      ? ([
          { platform: "linux", arch: "x64", isMusl: musl },
          "linux-x64-musl",
        ] as const)
      : ([
          { platform: "darwin", arch: "arm64", isMusl: musl },
          "darwin-arm64",
        ] as const);
  const path = fileURLToPath(nativeSqliteUrl(target));
  assertTrue(path.endsWith(`/native/${target}/evolu.node`));

  assertThrows(
    () => loadNativeSqlite({ rowPrototype: emptyPrototype, platform }),
    (error) => {
      assertInstanceOf(error, Error);
      assertEqual(
        error.message,
        `@evolu/nodejs can't load its SQLite for ${target}, ${path}. In the Evolu repository, build it with node packages/nodejs/scripts/build-native.mts.`,
      );
      assertInstanceOf(error.cause, Error);
    },
  );
});

test("loading throws for an addon of another version of the binding", () => {
  const platform = { platform: "linux", arch: "x64", isMusl: glibc } as const;
  const path = fileURLToPath(nativeSqliteUrl("linux-x64-gnu"));
  const required: Array<string> = [];

  assertThrows(
    () =>
      loadNativeSqlite({
        rowPrototype: emptyPrototype,
        platform,
        requireAddon: (addon) => {
          required.push(addon);
          return { createBinding: () => ({ abiVersion: 1 }) };
        },
      }),
    (error) => {
      assertInstanceOf(error, Error);
      assertEqual(
        error.message,
        `@evolu/nodejs's SQLite at ${path} implements version 1 of its binding, but this JavaScript needs version 2.`,
      );
    },
  );
  assertEqual(required, [path]);
});

// Two mappings of a process's /proc/self/maps, the dynamic linker's, which on
// musl is also its C library.
const muslMaps = `55d0c0a00000-55d0c0a01000 r--p 00000000 00:2d 1234 /usr/local/bin/node
7f2a1c000000-7f2a1c014000 r-xp 00014000 00:2d 5678 /lib/ld-musl-x86_64.so.1
`;
const glibcMaps = `55d0c0a00000-55d0c0a01000 r--p 00000000 00:2d 1234 /usr/local/bin/node
7f2a1c000000-7f2a1c02a000 r-xp 00001000 00:2d 5678 /usr/lib64/ld-linux-x86-64.so.2
`;

/**
 * A diagnostic report, `process.report`, that records `excludeNetwork` at each
 * report and whose header has `glibcVersionRuntime` unless it's undefined.
 */
const setupReport = (glibcVersionRuntime?: string) => {
  const excludeNetworkAtReports: Array<boolean> = [];
  const report = {
    excludeNetwork: false,
    getReport: () => {
      excludeNetworkAtReports.push(report.excludeNetwork);
      return {
        header:
          glibcVersionRuntime === undefined ? {} : { glibcVersionRuntime },
      };
    },
  };
  return { report, excludeNetworkAtReports };
};

test("isMusl tells musl by its dynamic linker in /proc/self/maps, reads it once, and never reads the diagnostic report", () => {
  for (const [maps, expected] of [
    [muslMaps, true],
    [glibcMaps, false],
  ] as const) {
    let reads = 0;
    const { report, excludeNetworkAtReports } = setupReport("2.28");
    const isMuslOfMaps = createIsMusl({
      readProcessMaps: () => {
        reads++;
        return maps;
      },
      report,
    });

    assertEqual([isMuslOfMaps(), isMuslOfMaps()], [expected, expected]);
    assertEqual(reads, 1);
    assertEqual(excludeNetworkAtReports, []);
  }
});

test("where /proc can't be read, isMusl reads the diagnostic report once, without the network, and restores the setting", () => {
  for (const [glibcVersionRuntime, expected] of [
    [undefined, true],
    ["2.28", false],
  ] as const) {
    const { report, excludeNetworkAtReports } =
      setupReport(glibcVersionRuntime);
    const isMuslOfReport = createIsMusl({
      readProcessMaps: () => {
        throw new Error("ENOENT: no such file or directory");
      },
      report,
    });

    assertEqual([isMuslOfReport(), isMuslOfReport()], [expected, expected]);
    assertEqual(excludeNetworkAtReports, [true]);
    assertFalse(report.excludeNetwork);
  }
});

test("isMusl of the running process reads /proc on Linux, without the diagnostic report, which it reads only where there's no /proc", (t) => {
  let reports = 0;
  t.mock.method(process.report, "getReport", () => {
    reports++;
    return { header: { glibcVersionRuntime: "2.28" } };
  });

  const running = isMusl();

  if (process.platform === "linux") {
    assertEqual(
      running,
      readFileSync("/proc/self/maps", "utf8").includes("/ld-musl-"),
    );
    assertEqual(reports, 0);
  } else {
    assertFalse(running);
    assertEqual(reports, 1);
  }
  assertEqual(isMusl(), running);
  assertEqual(reports, process.platform === "linux" ? 0 : 1);
});

/** A binding whose file opens record their runs and closes. */
const setupBinding = (failingSql?: string) => {
  const events: Array<string> = [];
  const database: NativeSqliteDatabase = {
    prepare: () => {
      throw new Error("Not prepared in this test.");
    },
    run: (sql) => {
      if (sql === failingSql) throw new Error(`${sql} failed`);
      events.push(`run ${sql}`);
      return 0;
    },
    export: () => new ArrayBuffer(0),
    close: () => {
      events.push("close");
    },
  };
  const binding = {
    abiVersion: 1,
    openMemory: () => {
      events.push("openMemory");
      return database;
    },
    openFile: (path: string) => {
      events.push(`openFile ${path}`);
      return database;
    },
    openEncryptedFile: (path: string, key: Uint8Array) => {
      events.push(`openEncryptedFile ${path} ${key.length}`);
      return database;
    },
  } as unknown as NativeSqlite;
  return { binding, events };
};

test("a configured binding sets a file connection's cache size and leaves memory databases as they open", () => {
  const { binding, events } = setupBinding();
  const configured = configureNativeSqlite(binding);

  configured.openFile("/a.db");
  configured.openEncryptedFile("/b.db", new Uint8Array(32));
  configured.openMemory();

  assertEqual(events, [
    "openFile /a.db",
    "run pragma cache_size = -16000",
    "openEncryptedFile /b.db 32",
    "run pragma cache_size = -16000",
    "openMemory",
  ]);
});

test("a configured binding closes a file connection whose setting fails and throws its error", () => {
  const { binding, events } = setupBinding("pragma cache_size = -16000");
  const configured = configureNativeSqlite(binding);

  assertThrows(
    () => configured.openFile("/a.db"),
    (error) => {
      assertInstanceOf(error, Error);
      assertEqual(error.message, "pragma cache_size = -16000 failed");
    },
  );

  assertEqual(events, ["openFile /a.db", "close"]);
});
