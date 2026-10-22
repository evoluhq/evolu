import {
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import {
  downloadWasm,
  readTarEntry,
  type DownloadWasmOptions,
} from "./download-wasm.mts";

describe("downloadWasm", () => {
  it("downloads the version from package.json by default", async (t) => {
    const download = setupDownload(t, {
      status: 404,
      body: encode("Not Found"),
    });
    const { version: _version, ...options } = download.options;
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { readonly version: string };
    const url = `https://registry.npmjs.org/@evolu/sqlite-wasm/-/sqlite-wasm-${version}.tgz`;

    await assertRejectsWithMessage(
      downloadWasm(options),
      `${url}: HTTP 404. @evolu/sqlite-wasm ${version} is not published yet. ${buildFromSource}`,
    );

    assertEqual(download.requests, [url]);
    assertFalse(existsSync(download.options.path));
  });

  it("writes the wasm from the tarball of the published package, creating its directory", async (t) => {
    const download = setupDownload(t, {
      status: 200,
      body: tarball([
        { name: "package/package.json", content: encode("{}") },
        { name: wasmEntry, content: wasm },
      ]),
    });
    const path = join(setupDirectory(t), "wasm/sqlite3.wasm");

    await downloadWasm({ ...download.options, path });

    assertEqualBytes(readFileSync(path), wasm);
    assertEqual(download.requests, [tarballUrl]);
    assertEqual(download.logged(), [
      `Wrote ${path} from @evolu/sqlite-wasm 3.53.4-build1.`,
    ]);
  });

  it("replaces a file that differs from the pin", async (t) => {
    const download = setupDownload(t, {
      status: 200,
      body: tarball([{ name: wasmEntry, content: wasm }]),
    });
    writeFileSync(download.options.path, encode("outdated wasm"));

    await downloadWasm(download.options);

    assertEqualBytes(readFileSync(download.options.path), wasm);
  });

  it("downloads nothing when the file is already the pinned wasm, even if the version is not published yet", async (t) => {
    const download = setupDownload(t, null);
    writeFileSync(download.options.path, wasm);

    await downloadWasm(download.options);

    assertEqual(download.requests, []);
    assertEqual(download.logged(), [
      `${download.options.path} is already the pinned wasm.`,
    ]);
  });

  it("refuses a version that is not published yet, and says to build the wasm", async (t) => {
    const download = setupDownload(t, {
      status: 404,
      body: encode("Not Found"),
    });

    await assertRejectsWithMessage(
      downloadWasm(download.options),
      `${tarballUrl}: HTTP 404. @evolu/sqlite-wasm 3.53.4-build1 is not published yet. ${buildFromSource}`,
    );
    assertFalse(existsSync(download.options.path));
  });

  it("refuses an unsuccessful download", async (t) => {
    const download = setupDownload(t, {
      status: 503,
      body: encode("Service Unavailable"),
    });

    await assertRejectsWithMessage(
      downloadWasm(download.options),
      `${tarballUrl}: HTTP 503`,
    );
    assertFalse(existsSync(download.options.path));
  });

  it("refuses a tarball without the wasm", async (t) => {
    const download = setupDownload(t, {
      status: 200,
      body: tarball([{ name: "package/package.json", content: encode("{}") }]),
    });

    await assertRejectsWithMessage(
      downloadWasm(download.options),
      `${tarballUrl} has no ${wasmEntry}.`,
    );
    assertFalse(existsSync(download.options.path));
  });

  it("refuses a wasm that differs from the pin, says to build it, and preserves the local file", async (t) => {
    const tampered = encode("tampered wasm");
    const download = setupDownload(t, {
      status: 200,
      body: tarball([{ name: wasmEntry, content: tampered }]),
    });
    const outdated = encode("outdated wasm");
    writeFileSync(download.options.path, outdated);

    await assertRejectsWithMessage(
      downloadWasm(download.options),
      `${tarballUrl}: ${wasmEntry} has sha256 ${sha256(tampered)}, not the pinned ${sha256(wasm)}. ${buildFromSource}`,
    );
    assertEqualBytes(readFileSync(download.options.path), outdated);
  });
});

describe("readTarEntry", () => {
  it("returns an entry after others, whose contents take whole blocks", () => {
    const content = new Uint8Array(700).map((_, index) => index % 251);

    const entry = readTarEntry(
      tar([
        { name: "package/package.json", content: encode("{}") },
        { name: "package/README.md", content: new Uint8Array(512) },
        { name: wasmEntry, content },
      ]),
      wasmEntry,
    );

    assertEqual(entry, content);
  });

  it("joins the ustar prefix and the name", () => {
    const entry = readTarEntry(
      tar([
        { prefix: "package/dist/wasm", name: "sqlite3.wasm", content: wasm },
      ]),
      wasmEntry,
    );

    assertEqual(entry, wasm);
  });

  it("returns null when the archive ends without the entry", () => {
    assertEqual(
      readTarEntry(
        tar([{ name: "package/package.json", content: encode("{}") }]),
        wasmEntry,
      ),
      null,
    );
  });

  it("returns null when the archive has no end blocks", () => {
    assertEqual(
      readTarEntry(
        tar([{ name: "package/package.json", content: encode("{}") }], false),
        wasmEntry,
      ),
      null,
    );
  });

  it("reads a size padded with spaces", () => {
    const entry = readTarEntry(
      tar([
        {
          name: wasmEntry,
          content: wasm,
          size: ` ${wasm.length.toString(8)} `,
        },
      ]),
      wasmEntry,
    );

    assertEqual(entry, wasm);
  });

  it("throws for a negative size, naming the header's offset", () => {
    assertThrowsWithMessage(
      () =>
        readTarEntry(
          tar([
            { name: "package/package.json", content: encode("{}") },
            { name: "package/README.md", content: wasm, size: "-1000" },
          ]),
          wasmEntry,
        ),
      'The tar header at offset 1024 has size "-1000", which is not an octal number.',
    );
  });

  it("throws for a size that is not octal, naming the header's offset", () => {
    assertThrowsWithMessage(
      () =>
        readTarEntry(
          tar([
            {
              name: "package/package.json",
              content: encode("{}"),
              size: "00000000009",
            },
            { name: wasmEntry, content: wasm },
          ]),
          wasmEntry,
        ),
      'The tar header at offset 0 has size "00000000009", which is not an octal number.',
    );
  });

  it("throws for an entry the archive truncates, naming the header's offset", () => {
    assertThrowsWithMessage(
      () =>
        readTarEntry(
          tar(
            [
              { name: "package/package.json", content: encode("{}") },
              {
                name: wasmEntry,
                content: new Uint8Array(100),
                size: (4096).toString(8),
              },
            ],
            false,
          ),
          wasmEntry,
        ),
      "The tar header at offset 1024 has size 4096, but only 512 bytes follow it.",
    );
  });
});

describe("download-wasm.mts CLI", () => {
  it("downloads the package.json version and verifies the wasm before writing it", (t) => {
    const directory = setupDirectory(t);
    const path = join(directory, "sqlite3.wasm");
    const checkPath = join(directory, "check-wasm.mts");
    const preloadPath = join(directory, "preload.mts");
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { readonly version: string };
    const url = `https://registry.npmjs.org/@evolu/sqlite-wasm/-/sqlite-wasm-${version}.tgz`;
    writeFileSync(
      checkPath,
      `export const checkWasmFile = () => ({ type: "Missing" });
export const wasmPath = ${JSON.stringify(path)};
export const wasmSha256 = ${JSON.stringify(sha256(wasm))};
`,
    );
    writeFileSync(
      preloadPath,
      `import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./check-wasm.mts" && context.parentURL === ${JSON.stringify(new URL("./download-wasm.mts", import.meta.url).href)}) {
      return { url: ${JSON.stringify(pathToFileURL(checkPath).href)}, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
globalThis.fetch = async (url) => {
  if (url !== ${JSON.stringify(url)}) throw new Error("Unexpected download: " + url);
  return new Response(new Uint8Array(${JSON.stringify([...tarball([{ name: wasmEntry, content: wasm }])])}));
};
`,
    );

    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "--import",
        preloadPath,
        fileURLToPath(new URL("./download-wasm.mts", import.meta.url)),
      ],
      { cwd: directory, encoding: "utf8" },
    );

    assertEqual(
      { status: result.status, stderr: result.stderr },
      { status: 0, stderr: "" },
    );
    assertEqualBytes(readFileSync(path), wasm);
    assertEqual(
      result.stdout,
      `Wrote ${path} from @evolu/sqlite-wasm ${version}.\n`,
    );
  });

  it("runs as the sqlite-wasm:download script of the repository", () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { readonly scripts: Readonly<Record<string, string>> };

    assertEqual(
      scripts["sqlite-wasm:download"],
      "node packages/sqlite-wasm/scripts/download-wasm.mts",
    );
  });
});

const encode = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text);

const wasm = encode("pinned wasm");

const wasmEntry = "package/dist/wasm/sqlite3.wasm";

const tarballUrl =
  "https://registry.npmjs.org/@evolu/sqlite-wasm/-/sqlite-wasm-3.53.4-build1.tgz";

const buildFromSource =
  "Build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

interface TarEntry {
  readonly prefix?: string;
  readonly name: string;
  readonly content: Uint8Array;
  /** The size field, the content's length in octal by default. */
  readonly size?: string;
}

/**
 * A ustar archive of the entries, with each header and content padded to whole
 * 512-byte blocks, ended by two zero blocks unless `end` is false.
 */
const tar = (entries: ReadonlyArray<TarEntry>, end = true): Uint8Array => {
  const blocks = entries.flatMap(({ prefix = "", name, content, size }) => {
    const header = new Uint8Array(512);
    header.set(encode(name), 0);
    header.set(
      encode(`${size ?? content.length.toString(8).padStart(11, "0")}\0`),
      124,
    );
    header.set(encode("0"), 156);
    header.set(encode("ustar\u000000"), 257);
    header.set(encode(prefix), 345);
    const padded = new Uint8Array(Math.ceil(content.length / 512) * 512);
    padded.set(content);
    return [header, padded];
  });
  if (end) blocks.push(new Uint8Array(1024));
  const archive = new Uint8Array(
    blocks.reduce((length, block) => length + block.length, 0),
  );
  let offset = 0;
  for (const block of blocks) {
    archive.set(block, offset);
    offset += block.length;
  }
  return archive;
};

const tarball = (entries: ReadonlyArray<TarEntry>): Uint8Array<ArrayBuffer> =>
  gzipSync(tar(entries));

/**
 * Options for a download of the pinned `wasm` to a new directory, whose fetch
 * records its requests and answers with `response`, or fails the test when it
 * is null. It also records what the download logs.
 */
const setupDownload = (
  t: TestContext,
  response: {
    readonly status: number;
    readonly body: Uint8Array<ArrayBuffer>;
  } | null,
) => {
  const requests: Array<string> = [];
  const log = t.mock.method(console, "log", () => undefined);
  const options: DownloadWasmOptions = {
    version: "3.53.4-build1",
    pinnedSha256: sha256(wasm),
    path: join(setupDirectory(t), "sqlite3.wasm"),
    fetch: (url) => {
      requests.push(url);
      if (response == null) throw new Error("Unexpected fetch.");
      return Promise.resolve(
        new Response(response.body, { status: response.status }),
      );
    },
  };
  return {
    options,
    requests,
    logged: (): ReadonlyArray<string> =>
      log.mock.calls.map(({ arguments: [message] }) => String(message)),
  };
};

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-download-wasm-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

const assertRejectsWithMessage = (
  promise: Promise<unknown>,
  message: string,
): Promise<void> =>
  assertRejects(promise, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });

const assertThrowsWithMessage = (run: () => unknown, message: string): void => {
  assertThrows(run, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });
};
