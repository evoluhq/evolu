import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from "@evolu/common";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import {
  amalgamationStamp,
  checkManifestUuid,
  fetchPinned,
  prepareSqlite,
  sqliteSource,
  type PinnedArchive,
} from "../scripts/sqlite-source.mts";

describe("sqliteSource", () => {
  it("pins SQLite 3.54.1 by the SHA3-256 sqlite.org publishes and its check-in", () => {
    assertEqual(sqliteSource, {
      url: "https://sqlite.org/2026/sqlite-src-3540100.zip",
      file: "sqlite-src-3540100.zip",
      hash: "877c6f4996ce7adb368686bce21638de9e3d91534832ad3d9d119037d1bc22ad",
      directory: "sqlite-src-3540100",
      checkIn:
        "555e07ef33f69a0957d24d8e555b702464a131d6f1607f4c3c1e4551e8e6ca76",
      version: "3.54.1",
    });
  });
});

describe("fetchPinned", () => {
  it("downloads an archive, checks its SHA3-256 and keeps it in the cache", async (t) => {
    const bytes = new TextEncoder().encode("archive");
    const server = await setupServer(t, bytes);
    const cache = setupDirectory(t);
    const archive = pinned(server.url, bytes);

    const path = await fetchPinned(archive, cache);

    assertEqual(path, join(cache, archive.file));
    assertEqualBytes(readFileSync(path), bytes);
    assertEqual(server.requests(), 1);
  });

  it("uses a verified cached archive without downloading it again", async (t) => {
    const bytes = new TextEncoder().encode("archive");
    const server = await setupServer(t, bytes);
    const cache = setupDirectory(t);
    const archive = pinned(server.url, bytes);
    await fetchPinned(archive, cache);

    await fetchPinned(archive, cache);

    assertEqual(server.requests(), 1);
  });

  it("rejects a download with another hash and caches nothing", async (t) => {
    const server = await setupServer(t, new TextEncoder().encode("tampered"));
    const cache = setupDirectory(t);
    const archive = pinned(server.url, new TextEncoder().encode("archive"));

    await assertRejects(
      fetchPinned(archive, cache),
      errorMessageMatches(/sha3-256/u),
    );
    assertFalse(existsSync(join(cache, archive.file)));
  });

  it("rejects a cached archive with another hash", async (t) => {
    const cache = setupDirectory(t);
    const archive = pinned(
      "http://127.0.0.1:1/",
      new TextEncoder().encode("a"),
    );
    writeFileSync(join(cache, archive.file), "tampered");

    await assertRejects(
      fetchPinned(archive, cache),
      errorMessageMatches(/sha3-256/u),
    );
  });

  it("rejects an HTTP error", async (t) => {
    const server = await setupServer(t, null);
    const cache = setupDirectory(t);
    const archive = pinned(server.url, new TextEncoder().encode("archive"));

    await assertRejects(
      fetchPinned(archive, cache),
      errorMessageMatches(/HTTP 404/u),
    );
  });
});

describe("checkManifestUuid", () => {
  it("accepts the pinned check-in and rejects another", (t) => {
    const tree = setupDirectory(t);
    writeFileSync(join(tree, "manifest.uuid"), "abc\n");

    checkManifestUuid(tree, "abc");
    assertThrows(
      () => {
        checkManifestUuid(tree, "def");
      },
      errorMessageMatches(/check-in abc, pinned def/u),
    );
  });
});

describe("prepareSqlite", () => {
  it("returns the generated amalgamation from the cache when its stamp matches", async (t) => {
    const cache = setupDirectory(t);
    const source = {
      ...sqliteSource,
      url: "http://127.0.0.1:1/unreachable.zip",
    };
    const directory = join(cache, source.directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "sqlite3.c"), "/* c */");
    writeFileSync(join(directory, "sqlite3.h"), "/* h */");
    writeFileSync(join(directory, "source.json"), amalgamationStamp(source));

    const sqlite = await prepareSqlite({
      source,
      cacheDirectory: cache,
      temporaryDirectory: setupDirectory(t),
    });

    assertEqual(sqlite, {
      directory,
      sqlite3c: join(directory, "sqlite3.c"),
      sqlite3h: join(directory, "sqlite3.h"),
    });
  });

  it("generates the amalgamation again when its stamp doesn't say how it was generated", async (t) => {
    const cache = setupDirectory(t);
    const server = await setupServer(t, new TextEncoder().encode("not a zip"));
    const source = { ...sqliteSource, url: server.url };
    const directory = join(cache, source.directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "sqlite3.c"), "/* c */");
    writeFileSync(join(directory, "sqlite3.h"), "/* h */");
    writeFileSync(
      join(directory, "source.json"),
      JSON.stringify({ hash: source.hash, checkIn: source.checkIn }),
    );

    // It fetches the source once, which has another hash.
    await assertRejects(
      prepareSqlite({
        source,
        cacheDirectory: cache,
        temporaryDirectory: setupDirectory(t),
      }),
      errorMessageMatches(/sha3-256/u),
    );
    assertEqual(server.requests(), 1);
  });

  it("generates the amalgamation without the variables configure and make read", async (t) => {
    // A source tree whose make writes the variables it sees into sqlite3.c.
    const tree = setupDirectory(t);
    const directory = "sqlite-src-variables";
    mkdirSync(join(tree, directory));
    writeFileSync(join(tree, directory, "manifest.uuid"), "variables\n");
    writeFileSync(join(tree, directory, "configure"), "#!/bin/sh\n", {
      mode: 0o755,
    });
    writeFileSync(
      join(tree, directory, "Makefile"),
      "sqlite3.c:\n\t@printf '%s' '$(CFLAGS)$(CPPFLAGS)$(OPTS)$(OPTIONS)$(EXTRA_SRC)$(AMALGAMATION_GEN_FLAGS)' > sqlite3.c\n\t@touch sqlite3.h\n",
    );
    execFileSync("zip", ["-qr", "source.zip", directory], { cwd: tree });
    const bytes = readFileSync(join(tree, "source.zip"));
    const server = await setupServer(t, bytes);
    const variables = {
      CFLAGS: "c",
      CPPFLAGS: "p",
      OPTS: "o",
      OPTIONS: "n",
      EXTRA_SRC: "e",
      AMALGAMATION_GEN_FLAGS: "a",
      MAKEFLAGS: "OPTS=m",
      GNUMAKEFLAGS: "OPTIONS=g",
    };
    const saved = Object.keys(variables).map(
      (name) => [name, process.env[name]] as const,
    );
    t.after(() => {
      for (const [name, value] of saved)
        if (value == null) delete process.env[name];
        else process.env[name] = value;
    });
    Object.assign(process.env, variables);

    const sqlite = await prepareSqlite({
      source: {
        ...pinned(server.url, bytes),
        directory,
        checkIn: "variables",
        version: "0",
      },
      cacheDirectory: setupDirectory(t),
      temporaryDirectory: setupDirectory(t),
    });

    assertEqual(readFileSync(sqlite.sqlite3c, "utf8"), "");
  });
});

const errorMessageMatches =
  (pattern: RegExp) =>
  (error: unknown): void => {
    assertInstanceOf(error, Error);
    assert(pattern.test(error.message), `Unexpected message: ${error.message}`);
  };

const pinned = (url: string, bytes: Uint8Array): PinnedArchive => ({
  url,
  file: "archive.zip",
  hash: createHash("sha3-256").update(bytes).digest("hex"),
});

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

/** Serves `bytes` for any path, or 404 when `bytes` is null. */
const setupServer = async (
  t: TestContext,
  bytes: Uint8Array | null,
): Promise<{ readonly url: string; readonly requests: () => number }> => {
  let requests = 0;
  const server: Server = createServer((_request, response) => {
    requests++;
    if (bytes == null) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200).end(bytes);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/archive.zip`,
    requests: () => requests,
  };
};
