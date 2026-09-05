import {
  assertEqual,
  assertErr,
  assertOk,
  assertTrue,
  assertType,
  createRun,
  testAbortError,
  testAbortReason,
  testCreateRun,
  type FsError,
  type Task,
} from "@evolu/common";
import { constants, promises as nodeFs } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import { createNodeFs } from "./Fs.ts";

let directory = "";

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "evolu-fs-"));
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

const setupFile = async (name: string, content: string): Promise<string> => {
  const path = join(directory, name);
  await writeFile(path, content);
  return path;
};

describe("readFile", () => {
  it("reads bytes by default and a string with an encoding", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const path = await setupFile("read.txt", "héllo");

    const bytes = await run(fs.readFile(path));
    assertOk(bytes, new TextEncoder().encode("héllo"));
    assertOk(await run(fs.readFile(path, "utf8")), "héllo");
    assertOk(await run(fs.readFile(path, { encoding: "latin1" })), "hÃ©llo");
    assertOk(await run(fs.readFile(pathToFileURL(path), "utf8")), "héllo");

    assertOk(await run(fs.readFile(path, { encoding: "hex" })), "68c3a96c6c6f");
  });

  it("maps NotFound, IsDirectory, and unknown codes", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const missing = join(directory, "missing.txt");

    const notFound = await run(fs.readFile(missing));
    assertErr(notFound);
    assertEqual(notFound.error.reason, "NotFound");
    assertEqual(notFound.error.path, missing);
    assertEqual(notFound.error.syscall, "open");
    assertTrue(notFound.error.message.includes("ENOENT"));

    const isDirectory = await run(fs.readFile(directory, "utf8"));
    assertErr(isDirectory);
    assertEqual(isDirectory.error.reason, "IsDirectory");

    const unknown = await run(fs.readFile("bad\0path"));
    assertErr(unknown);
    assertEqual(unknown.error.reason, "Unknown");
    assertEqual(unknown.error.syscall, "readFile");
    assertEqual(unknown.error.path, "bad\0path");

    const missingUrl = pathToFileURL(missing);
    const url = await run(fs.readFile(missingUrl));
    assertErr(url);
    assertEqual(url.error.path, missingUrl.href);
  });

  for (const href of ["https://example.com/file", "file:///tmp/a%2Fb"]) {
    it(`returns FsError for ${href}`, async () => {
      const fs = createNodeFs();
      await using run = testCreateRun();
      const url = new URL(href);

      const result = await run(fs.readFile(url));

      assertErr(result);
      assertEqual(result.error.type, "FsError");
      assertEqual(result.error.reason, "Unknown");
      assertEqual(result.error.path, url.href);
      assertEqual(result.error.syscall, "readFile");
      assertTrue(result.error.message.length > 0);
    });
  }

  it("aborts with the Run", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const path = await setupFile("abort.txt", "content");
    const fiber = run.abortable(fs.readFile(path));
    fiber.abort(testAbortReason);

    assertErr(await fiber, testAbortError);
  });

  it("returns a completed read after an abort request", async (t) => {
    const nodeReadFile = t.mock.method(nodeFs, "readFile", () =>
      Promise.resolve("content"),
    );
    syncBuiltinESMExports();
    t.after(() => {
      nodeReadFile.mock.restore();
      syncBuiltinESMExports();
    });
    const fs = createNodeFs();
    await using run = testCreateRun();

    const fiber = run.abortable(fs.readFile("completed.txt", "utf8"));
    fiber.abort(testAbortReason);

    assertOk(await fiber, "content");
  });
});

describe("writeFile", () => {
  it("writes strings and bytes with Node options", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const path = join(directory, "write.txt");

    assertOk(await run(fs.writeFile(path, "first")));
    assertOk(await run(fs.writeFile(path, " second", { flag: "a" })));
    assertEqual(await readFile(path, "utf8"), "first second");

    assertOk(await run(fs.writeFile(path, new TextEncoder().encode("bytes"))));
    assertEqual(await readFile(path, "utf8"), "bytes");
    assertOk(await run(fs.writeFile(path, "aGV4", { encoding: "base64" })));
    assertEqual(await readFile(path, "utf8"), "hex");

    const exists = await run(fs.writeFile(path, "x", { flag: "wx" }));
    assertErr(exists);
    assertEqual(exists.error.reason, "AlreadyExists");
  });

  it("aborts with the Run", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const fiber = run.abortable(fs.writeFile(join(directory, "a.txt"), "x"));
    fiber.abort(testAbortReason);

    assertErr(await fiber, testAbortError);
  });

  it("returns a completed write after an abort request", async (t) => {
    const nodeWriteFile = t.mock.method(nodeFs, "writeFile", () =>
      Promise.resolve(),
    );
    syncBuiltinESMExports();
    t.after(() => {
      nodeWriteFile.mock.restore();
      syncBuiltinESMExports();
    });
    const fs = createNodeFs();
    await using run = testCreateRun();

    const fiber = run.abortable(fs.writeFile("completed.txt", "content"));
    fiber.abort(testAbortReason);

    assertOk(await fiber);
  });
});

describe("createDirectory and remove", () => {
  it("creates and removes directories with Node semantics", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const nested = join(directory, "a", "b");

    const missingParent = await run(fs.createDirectory(nested));
    assertErr(missingParent);
    assertEqual(missingParent.error.reason, "NotFound");
    assertOk(await run(fs.createDirectory(nested, { recursive: true })));
    assertOk(await run(fs.createDirectory(nested, { recursive: true })));

    const already = await run(fs.createDirectory(nested));
    assertErr(already);
    assertEqual(already.error.reason, "AlreadyExists");

    const notDirectory = await run(
      fs.getMetadata(join(await setupFile("file.txt", ""), "child")),
    );
    assertErr(notDirectory);
    assertEqual(notDirectory.error.reason, "NotDirectory");

    await writeFile(join(nested, "file.txt"), "x");
    const isDirectory = await run(
      fs.remove(join(directory, "a"), { recursive: false }),
    );
    assertErr(isDirectory);
    assertEqual(isDirectory.error.reason, "IsDirectory");

    assertOk(await run(fs.remove(join(directory, "a"), { recursive: true })));
    assertOk(await run(fs.exists(nested)), false);

    const missing = await run(fs.remove(nested));
    assertErr(missing);
    assertEqual(missing.error.reason, "NotFound");
    assertOk(await run(fs.remove(nested, { force: true })));
  });

  it("returns completed operations after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const fiber = run.abortable(fs.createDirectory(join(directory, "aborted")));
    fiber.abort(testAbortReason);

    assertOk(await fiber);
    assertOk(await run(fs.exists(join(directory, "aborted"))), true);
    const removeFiber = run.abortable(
      fs.remove(join(directory, "aborted"), { recursive: true }),
    );
    removeFiber.abort(testAbortReason);
    assertOk(await removeFiber);
    assertOk(await run(fs.exists(join(directory, "aborted"))), false);
  });
});

describe("getMetadata and exists", () => {
  it("returns file and directory metadata as data", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const path = await setupFile("metadata.txt", "12345");

    const metadata = await run(fs.getMetadata(path));
    assertOk(metadata);
    assertEqual(metadata.value.size, 5);
    assertEqual(metadata.value.type, "File");
    assertEqual(structuredClone(metadata.value), metadata.value);
    assertTrue(metadata.value.mtimeMs > 0);
    assertTrue(metadata.value.mtime instanceof Date);

    const directoryMetadata = await run(fs.getMetadata(directory));
    assertOk(directoryMetadata);
    assertEqual(directoryMetadata.value.type, "Directory");

    const missing = await run(fs.getMetadata(join(directory, "nope")));
    assertErr(missing);
    assertEqual(missing.error.reason, "NotFound");
    assertEqual(missing.error.syscall, "stat");

    assertOk(await run(fs.exists(path)), true);
    assertOk(await run(fs.exists(join(directory, "nope"))), false);
  });

  it("follows symbolic links when reading metadata", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const target = await setupFile("metadata-target.txt", "hello");
    const link = join(directory, "metadata-link.txt");
    await symlink(target, link);

    const metadata = await run(fs.getMetadata(pathToFileURL(link)));
    assertOk(metadata);
    assertEqual(metadata.value.type, "File");
    assertEqual(metadata.value.size, 5);
  });

  it("classifies every entry kind from native metadata", async (t) => {
    const nativeMetadata = await stat(directory);
    const nodeStat = t.mock.method(nodeFs, "stat", () =>
      Promise.resolve(nativeMetadata),
    );
    syncBuiltinESMExports();
    t.after(() => {
      nodeStat.mock.restore();
      syncBuiltinESMExports();
    });
    const fs = createNodeFs();
    await using run = testCreateRun();

    for (const [fileMode, type] of [
      [constants.S_IFREG, "File"],
      [constants.S_IFDIR, "Directory"],
      [constants.S_IFLNK, "SymbolicLink"],
      [constants.S_IFBLK, "BlockDevice"],
      [constants.S_IFCHR, "CharacterDevice"],
      [constants.S_IFIFO, "FIFO"],
      [constants.S_IFSOCK, "Socket"],
      [0, "Unknown"],
    ] as const) {
      nativeMetadata.mode = fileMode | 0o640;
      const metadata = await run(fs.getMetadata("entry"));
      assertOk(metadata);
      assertEqual(metadata.value.type, type);
    }
  });

  it("exists preserves errors other than NotFound", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const file = await setupFile("exists-parent.txt", "");
    const path = join(file, "child");
    const task = fs.exists(path);
    assertType<typeof task, Task<boolean, FsError>>();

    const result = await run(task);
    assertErr(result);
    assertEqual(result.error.reason, "NotDirectory");
    assertEqual(result.error.path, path);

    const invalid = await run(fs.exists("bad\0path"));
    assertErr(invalid);
    assertEqual(invalid.error.reason, "Unknown");
  });

  it("exists preserves permission errors", async (t) => {
    const error = Object.assign(new Error("Permission denied"), {
      code: "EACCES",
      syscall: "access",
    });
    const nodeAccess = t.mock.method(nodeFs, "access", () =>
      Promise.reject(error),
    );
    syncBuiltinESMExports();
    t.after(() => {
      nodeAccess.mock.restore();
      syncBuiltinESMExports();
    });
    const fs = createNodeFs();
    await using run = testCreateRun();

    const result = await run(fs.exists("protected"));
    assertErr(result);
    assertEqual(result.error.reason, "PermissionDenied");
  });

  it("returns metadata and existence after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const metadataFiber = run.abortable(fs.getMetadata(directory));
    metadataFiber.abort(testAbortReason);
    const metadata = await metadataFiber;
    assertOk(metadata);
    assertEqual(metadata.value.type, "Directory");

    const existsFiber = run.abortable(fs.exists(directory));
    existsFiber.abort(testAbortReason);
    assertOk(await existsFiber, true);

    const missingFiber = run.abortable(
      fs.exists(join(directory, "missing-after-abort")),
    );
    missingFiber.abort(testAbortReason);
    assertOk(await missingFiber, false);

    const invalidFiber = run.abortable(fs.exists("bad\0path"));
    invalidFiber.abort(testAbortReason);
    const invalid = await invalidFiber;
    assertErr(invalid);
    assertEqual(invalid.error.type, "FsError");
    assertEqual(invalid.error.reason, "Unknown");
  });
});

describe("readDirectory", () => {
  it("lists names relative to the directory, optionally recursively", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = join(directory, "listing");
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "first.txt"), "first");
    await writeFile(join(root, "nested", "second.txt"), "second");

    const names = await run(fs.readDirectory(root));
    assertOk(names);
    assertType<typeof names.value, ReadonlyArray<string>>();
    assertEqual(names.value.toSorted(), ["first.txt", "nested"]);

    const recursive = await run(
      fs.readDirectory(pathToFileURL(root), { recursive: true }),
    );
    assertOk(recursive);
    assertEqual(recursive.value.toSorted(), [
      "first.txt",
      "nested",
      join("nested", "second.txt"),
    ]);

    const empty = join(root, "empty");
    await mkdir(empty);
    assertOk(await run(fs.readDirectory(empty)), []);
  });

  it("reports missing paths and paths that are not directories", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const missing = await run(
      fs.readDirectory(join(directory, "missing-listing")),
    );
    assertErr(missing);
    assertEqual(missing.error.reason, "NotFound");

    const file = await setupFile("not-a-directory.txt", "");
    const result = await run(fs.readDirectory(file));
    assertErr(result);
    assertEqual(result.error.reason, "NotDirectory");
  });

  it("returns directory entries after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = join(directory, "aborted-listing");
    await mkdir(root);
    await writeFile(join(root, "entry.txt"), "entry");
    const fiber = run.abortable(fs.readDirectory(root));
    fiber.abort(testAbortReason);
    assertOk(await fiber, ["entry.txt"]);
  });
});

describe("copy and copyFile", () => {
  it("copy uses Node's default replacement and explicit conflict options", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const source = await setupFile("native-copy-source", "new");
    const destination = await setupFile("native-copy-destination", "old");
    const sourceUrl = pathToFileURL(source);
    const destinationUrl = pathToFileURL(destination);

    assertOk(await run(fs.copy(sourceUrl, destinationUrl, { force: false })));
    assertEqual(await readFile(destination, "utf8"), "old");
    const conflict = await run(
      fs.copy(sourceUrl, destinationUrl, {
        force: false,
        errorOnExist: true,
      }),
    );
    assertErr(conflict);
    assertEqual(conflict.error.reason, "AlreadyExists");
    assertEqual(conflict.error.path, sourceUrl.href);
    assertEqual(conflict.error.destination, destinationUrl.href);
    assertEqual(await readFile(destination, "utf8"), "old");

    assertOk(await run(fs.copy(sourceUrl, destinationUrl)));
    assertEqual(await readFile(destination, "utf8"), "new");
  });

  it("copy merges directories by default and supports Node's directory conflict option", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-merge-"));
    const source = join(root, "source");
    const destination = join(root, "destination");
    await mkdir(join(source, "nested"), { recursive: true });
    await mkdir(join(destination, "nested"), { recursive: true });
    await writeFile(join(source, "nested", "new.txt"), "new");
    await writeFile(join(destination, "nested", "old.txt"), "old");
    await writeFile(join(destination, "nested", "new.txt"), "replaced");

    const conflict = await run(
      fs.copy(source, destination, {
        force: false,
        errorOnExist: true,
      }),
    );
    assertErr(conflict);
    assertEqual(conflict.error.reason, "AlreadyExists");
    assertEqual(
      await readFile(join(destination, "nested", "new.txt"), "utf8"),
      "replaced",
    );

    assertOk(await run(fs.copy(source, destination)));
    assertEqual(
      await readFile(join(destination, "nested", "new.txt"), "utf8"),
      "new",
    );
    assertEqual(
      await readFile(join(destination, "nested", "old.txt"), "utf8"),
      "old",
    );
  });

  it("copy retains Node's symlink replacement despite conflict options", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-native-links-"));
    const target = join(root, "target");
    const source = join(root, "source");
    const destination = join(root, "destination");
    await writeFile(target, "target");
    await symlink("target", source);
    await symlink("missing-old-target", destination);

    assertOk(
      await run(
        fs.copy(source, destination, { force: false, errorOnExist: true }),
      ),
    );
    assertEqual(await readlink(destination), target);
    assertEqual(await readlink(source), "target");
    assertEqual(await readFile(destination, "utf8"), "target");
  });

  it("copy preserves Node's errors for replacing entries with symlinks", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-native-link-errors-"));
    const source = join(root, "source");
    const destination = join(root, "destination");
    await symlink("missing-target", source);
    await writeFile(destination, "keep");

    const fileConflict = await run(fs.copy(source, destination));
    assertErr(fileConflict);
    assertEqual(fileConflict.error.reason, "AlreadyExists");
    assertEqual(await readFile(destination, "utf8"), "keep");

    await rm(destination);
    await symlink("old-target", destination);
    const danglingConflict = await run(fs.copy(source, destination));
    assertErr(danglingConflict);
    assertEqual(danglingConflict.error.reason, "NotFound");
    assertEqual(await readlink(destination), "old-target");
  });

  it(`copyFile creates files exclusively when copies compete`, async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-race-"));
    const source = join(root, "source");
    await writeFile(source, "source");
    for (let index = 0; index < 16; index++) {
      const destination = join(root, `destination-${index}`);
      const results = await Promise.all([
        run(fs.copyFile(source, destination)),
        run(fs.copyFile(source, destination)),
      ]);
      assertEqual(results.filter((result) => result.ok).length, 1);
      const failure = results.find((result) => !result.ok);
      assertTrue(failure !== undefined);
      assertErr(failure);
      assertEqual(failure.error.reason, "AlreadyExists");
      assertEqual(await readFile(destination, "utf8"), "source");
    }
  });

  it("preserves absolute symlink targets containing parent components", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-link-absolute-"));
    await mkdir(join(root, "physical", "deep"), { recursive: true });
    await writeFile(join(root, "physical", "target"), "correct");
    await writeFile(join(root, "target"), "wrong");
    await symlink(join(root, "physical", "deep"), join(root, "alias"));
    const target = join(root, "alias") + sep + ".." + sep + "target";
    const source = join(root, "source");
    const destination = join(root, "destination");
    await symlink(target, source);

    assertOk(await run(fs.copy(source, destination)));

    assertEqual(await readlink(destination), target);
    assertEqual(await readFile(destination, "utf8"), "correct");
    assertEqual(await readFile(source, "utf8"), "correct");
  });

  it("preserves an ancestor symlink and access to the source", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-link-ancestor-"));
    const real = join(root, "real");
    const target = join(real, "child");
    const alias = join(root, "alias");
    await mkdir(target, { recursive: true });
    await symlink(target, join(real, "inner"));
    await symlink(real, alias);
    const source = join(alias, "inner");

    const result = await run(fs.copy(source, alias, { force: true }));

    assertErr(result);
    assertEqual(result.error.reason, "Unknown");
    assertEqual(await readlink(alias), real);
    assertEqual(await readlink(source), target);
    assertTrue((await stat(source)).isDirectory());
  });

  it("retains Node's guards against copying a directory into itself", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-self-"));
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "keep"), "keep");
    const alias = join(root, "alias");
    await symlink(source, alias);
    for (const destination of [
      source,
      join(source, "nested"),
      join(alias, "nested"),
    ]) {
      const result = await run(fs.copy(source, destination, { force: true }));
      assertErr(result);
      assertEqual(result.error.reason, "Unknown");
    }
    assertEqual(await readFile(join(source, "keep"), "utf8"), "keep");
    assertOk(await run(fs.exists(join(source, "nested"))), false);
  });

  it("copies relative and dangling symbolic links into missing parents", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const root = await mkdtemp(join(directory, "copy-new-links-"));
    const source = join(root, "source");
    await symlink("missing-target", source);
    const destination = join(root, "nested", "destination");

    assertOk(await run(fs.copy(source, destination)));
    assertEqual(await readlink(destination), join(root, "missing-target"));
  });

  it(`copyFile copies files and requires explicit overwrite`, async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const source = await setupFile(`copyFile-source.txt`, "source");
    const destination = join(directory, `copyFile-destination.txt`);
    assertOk(await run(fs.copyFile(source, destination)));
    assertEqual(await readFile(destination, "utf8"), "source");

    await writeFile(source, "changed");
    const sourceUrl = pathToFileURL(source);
    const destinationUrl = pathToFileURL(destination);
    const existing = await run(fs.copyFile(sourceUrl, destinationUrl));
    assertErr(existing);
    assertEqual(existing.error.reason, "AlreadyExists");
    assertEqual(existing.error.path, sourceUrl.href);
    assertEqual(existing.error.destination, destinationUrl.href);
    assertEqual(await readFile(destination, "utf8"), "source");

    assertOk(
      await run(fs.copyFile(sourceUrl, destinationUrl, { overwrite: true })),
    );
    assertEqual(await readFile(destination, "utf8"), "changed");
  });

  (["copy", "copyFile"] as const).forEach((operation) => {
    it(`${operation} reports missing sources`, async () => {
      const fs = createNodeFs();
      await using run = testCreateRun();
      const source = join(directory, `missing-${operation}`);
      const destination = join(directory, `missing-${operation}-destination`);
      const result = await run(fs[operation](source, destination));
      assertErr(result);
      assertEqual(result.error.reason, "NotFound");
      assertEqual(result.error.path, source);
      assertEqual(result.error.destination, destination);
    });

    it(`${operation} returns a completed copy after an abort request`, async () => {
      const fs = createNodeFs();
      await using run = testCreateRun();
      const source = await setupFile(`${operation}-abort-source.txt`, "copied");
      const destination = join(directory, `${operation}-abort-destination.txt`);
      const fiber = run.abortable(fs[operation](source, destination));
      fiber.abort(testAbortReason);
      assertOk(await fiber);
      assertEqual(await readFile(destination, "utf8"), "copied");
    });
  });

  it("copies a directory tree and preserves timestamps when requested", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const source = join(directory, "copy-tree-source");
    const destination = join(directory, "copy-tree-destination");
    await mkdir(join(source, "nested"), { recursive: true });
    const file = join(source, "nested", "file.txt");
    await writeFile(file, "nested file");
    const modified = new Date("2020-01-01T00:00:00Z");
    await utimes(file, modified, modified);

    assertOk(
      await run(fs.copy(source, destination, { preserveTimestamps: true })),
    );
    const copiedFile = join(destination, "nested", "file.txt");
    assertEqual(await readFile(copiedFile, "utf8"), "nested file");
    assertEqual((await stat(copiedFile)).mtimeMs, modified.getTime());
  });

  it("reports file and directory mismatches", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const file = await setupFile("copy-mismatch.txt", "file");
    const target = join(directory, "copy-mismatch-directory");
    await mkdir(target);

    const toDirectory = await run(fs.copy(file, target));
    assertErr(toDirectory);
    assertEqual(toDirectory.error.reason, "IsDirectory");
    const toFile = await run(fs.copy(target, file));
    assertErr(toFile);
    assertEqual(toFile.error.reason, "NotDirectory");

    const directoryCopy = await run(
      fs.copyFile(target, join(directory, "copy-single-directory")),
    );
    assertErr(directoryCopy);
    assertEqual(directoryCopy.error.path, target);
  });
});

describe("rename", () => {
  it("renames files and directories", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const source = await setupFile("rename-source.txt", "renamed");
    const destination = join(directory, "rename-destination.txt");
    await writeFile(destination, "old destination");
    assertOk(
      await run(fs.rename(pathToFileURL(source), pathToFileURL(destination))),
    );
    assertOk(await run(fs.exists(source)), false);
    assertEqual(await readFile(destination, "utf8"), "renamed");

    const oldDirectory = join(directory, "rename-old-directory");
    const newDirectory = join(directory, "rename-new-directory");
    await mkdir(oldDirectory);
    await writeFile(join(oldDirectory, "inside.txt"), "inside");
    assertOk(await run(fs.rename(oldDirectory, newDirectory)));
    assertOk(await run(fs.exists(oldDirectory)), false);
    assertEqual(
      await readFile(join(newDirectory, "inside.txt"), "utf8"),
      "inside",
    );
  });

  it("reports source and destination when rename fails", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const source = join(directory, "missing-rename");
    const destination = join(directory, "missing-rename-destination");
    const result = await run(fs.rename(source, destination));
    assertErr(result);
    assertEqual(result.error.reason, "NotFound");
    assertEqual(result.error.path, source);
    assertEqual(result.error.destination, destination);
  });

  it("returns a completed rename after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const source = await setupFile("rename-abort-source.txt", "renamed");
    const destination = join(directory, "rename-abort-destination.txt");
    const fiber = run.abortable(fs.rename(source, destination));
    fiber.abort(testAbortReason);
    assertOk(await fiber);
    assertOk(await run(fs.exists(source)), false);
    assertEqual(await readFile(destination, "utf8"), "renamed");
  });
});

describe("createTempDirectory", () => {
  [false, true].forEach((absolute) => {
    it(`follows symlinks before parent components in ${absolute ? "absolute" : "relative"} paths`, async () => {
      const fs = createNodeFs();
      await using run = testCreateRun();
      const root = await mkdtemp(join(directory, "temp-parent-"));
      const physical = join(root, "physical");
      await mkdir(join(physical, "deep"), { recursive: true });
      await symlink(join(physical, "deep"), join(root, "alias"));
      const originalCwd = process.cwd();
      try {
        process.chdir(root);
        const parent = (absolute ? root + sep : "") + "alias" + sep + "..";
        const temp = await run(fs.createTempDirectory({ directory: parent }));
        assertOk(temp);
        {
          await using created = temp.value;
          assertEqual(
            await realpath(dirname(created.path)),
            await realpath(physical),
          );
          process.chdir(originalCwd);
          assertTrue((await stat(created.path)).isDirectory());
        }
        assertOk(await run(fs.exists(temp.value.path)), false);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  it("does not normalize away a missing parent component", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const parent = directory + sep + "missing-parent" + sep + "..";
    const result = await run(fs.createTempDirectory({ directory: parent }));
    if (result.ok) await result.value[Symbol.asyncDispose]();

    assertErr(result);
    assertEqual(result.error.reason, "NotFound");
    assertEqual(result.error.path, parent);
  });

  it("disposes the original directory after the working directory changes", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const originalCwd = process.cwd();
    const root = await mkdtemp(join(directory, "temp-cwd-"));
    const other = join(root, "other");
    await mkdir(other);

    try {
      process.chdir(root);
      const temp = await run(fs.createTempDirectory({ directory: "" }));
      assertOk(temp);
      const originalPath = resolve(temp.value.path);
      const otherPath = join(other, basename(temp.value.path));
      await mkdir(otherPath);
      const sentinel = join(otherPath, "keep.txt");
      await writeFile(sentinel, "keep");

      {
        await using created = temp.value;
        process.chdir(other);
        assertEqual(basename(created.path), basename(originalPath));
      }

      assertOk(await run(fs.exists(originalPath)), false);
      assertEqual(await readFile(sentinel, "utf8"), "keep");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("defaults to the system temporary directory", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const temp = await run(fs.createTempDirectory());
    assertOk(temp);
    await using directory = temp.value;

    assertEqual(dirname(directory.path), await realpath(tmpdir()));
    assertTrue(basename(directory.path).length > 0);
    assertOk(await run(fs.exists(directory.path)), true);
  });

  it("uses a name prefix in the system temporary directory", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const temp = await run(fs.createTempDirectory({ prefix: "evolu-fs-" }));
    assertOk(temp);
    await using directory = temp.value;

    assertEqual(dirname(directory.path), await realpath(tmpdir()));
    assertTrue(basename(directory.path).startsWith("evolu-fs-"));
  });

  it("keeps an empty prefix inside the supplied directory", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const temp = await run(
      fs.createTempDirectory({ directory: directory + sep, prefix: "" }),
    );
    assertOk(temp);
    await using created = temp.value;

    assertEqual(dirname(created.path), await realpath(directory));
    assertTrue(basename(created.path).length > 0);
  });

  it("resolves an empty parent to the current directory", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const temp = await run(
      fs.createTempDirectory({ directory: "", prefix: "evolu-fs-" }),
    );
    assertOk(temp);
    await using directory = temp.value;

    assertEqual(resolve(dirname(directory.path)), process.cwd());
    assertTrue(basename(directory.path).startsWith("evolu-fs-"));
  });

  it("creates a directory under the supplied parent and removes it on disposal", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const parent = await realpath(directory);
    const prefix = join(parent, "temp-");

    let path = "";
    {
      const temp = await run(
        fs.createTempDirectory({ directory, prefix: "temp-" }),
      );
      assertOk(temp);
      await using created = temp.value;
      path = created.path;
      assertEqual(dirname(path), parent);
      assertTrue(path.startsWith(prefix));
      await writeFile(join(path, "inside.txt"), "x");
    }
    assertOk(await run(fs.exists(path)), false);
  });

  it("reports a missing parent", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const parent = join(directory, "missing");

    const missing = await run(
      fs.createTempDirectory({ directory: parent, prefix: "temp-" }),
    );
    assertErr(missing);
    assertEqual(missing.error.reason, "NotFound");
    assertEqual(missing.error.path, parent);
    assertEqual(missing.error.syscall, "realpath");
  });

  it("reports a non-directory parent when creation fails", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const parent = await setupFile("temp-file-parent", "keep");

    const result = await run(fs.createTempDirectory({ directory: parent }));

    assertErr(result);
    assertEqual(result.error.reason, "NotDirectory");
    assertEqual(result.error.path, (await realpath(parent)) + sep);
    assertEqual(result.error.syscall, "mkdtemp");
    assertEqual(await readFile(parent, "utf8"), "keep");
  });

  it("returns a disposable directory after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();

    let path = "";
    {
      const fiber = run.abortable(
        fs.createTempDirectory({ directory, prefix: "aborted-temp-" }),
      );
      fiber.abort(testAbortReason);

      const temp = await fiber;
      assertOk(temp);
      await using created = temp.value;
      path = created.path;
      assertOk(await run(fs.exists(path)), true);
      await writeFile(join(path, "inside.txt"), "x");
    }
    assertOk(await run(fs.exists(path)), false);
  });

  it("returns the file system error after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const fiber = run.abortable(
      fs.createTempDirectory({
        directory: join(directory, "missing"),
        prefix: "aborted-temp-",
      }),
    );
    fiber.abort(testAbortReason);

    const result = await fiber;
    assertErr(result);
    assertEqual(result.error.type, "FsError");
    assertEqual(result.error.reason, "NotFound");
  });
});

describe("createNodeFs", () => {
  it("preserves errors from non-cancellable operations after an abort request", async () => {
    const fs = createNodeFs();
    await using run = testCreateRun();
    const missing = join(directory, "missing-after-abort");
    const destination = join(directory, "unused-destination");
    const tasks: ReadonlyArray<Task<unknown, FsError>> = [
      fs.readDirectory(missing),
      fs.createDirectory(join(missing, "nested")),
      fs.copy(missing, destination),
      fs.copyFile(missing, destination),
      fs.rename(missing, destination),
      fs.remove(missing),
      fs.getMetadata(missing),
    ];

    for (const task of tasks) {
      const fiber = run.abortable(task);
      fiber.abort(testAbortReason);
      const result = await fiber;
      assertErr(result);
      assertEqual(result.error.type, "FsError");
      assertEqual(result.error.reason, "NotFound");
    }
  });

  it("can be injected into a Run", async () => {
    await using run = createRun({ fs: createNodeFs() });
    assertOk(await run(run.deps.fs.exists(directory)), true);
    assertTrue(typeof run.deps.time.now === "function");
  });
});
