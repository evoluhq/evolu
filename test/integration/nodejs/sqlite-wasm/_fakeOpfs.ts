/**
 * An in-memory OPFS for the Node.js tests of `SahPool`, with fault injection.
 *
 * It implements {@link OpfsRoot} and the handle interfaces `SahPool.ts`
 * declares, as the browser does:
 *
 * - A file has at most one sync access handle. Another acquisition rejects with a
 *   `NoModificationAllowedError`, or an `InvalidStateError` in WebKit mode,
 *   until the handle closes, and a closed handle throws `InvalidStateError`.
 * - A write past the end zero-extends the file, a read past the end returns the
 *   bytes there are, and truncate shrinks or zero-extends.
 * - Directories and files are created by `getDirectoryHandle` and `getFileHandle`
 *   with `create`, and `values` lists them in creation order. An empty
 *   directory name throws a `TypeError`.
 *
 * Every call is recorded in {@link FakeOpfs.calls} before it runs, and a
 * {@link FakeOpfsFaultHook} set with {@link FakeOpfs.inject} can make it fail,
 * return another count, drop a write or truncate, or wait. To simulate a worker
 * that died, a test abandons its instance, calls
 * {@link FakeOpfs.releaseHandles}, and opens the pool again on a new instance;
 * {@link crashAfterWrites} makes it die at a given write.
 *
 * It is a test helper rather than a library-exported `testX` helper of the
 * package: only these tests use it, and its fault API follows what they need.
 *
 * @module
 */

import type {
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsRoot,
  OpfsRootDep,
  OpfsSyncAccessHandle,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";

/** A method of the fake, as {@link FakeOpfsCall} names it. */
export type FakeOpfsMethod =
  | "getDirectory"
  | "getDirectoryHandle"
  | "getFileHandle"
  | "values"
  | "createSyncAccessHandle"
  | "read"
  | "write"
  | "truncate"
  | "getSize"
  | "flush"
  | "close";

/**
 * A call the fake received. The path is the entry's, from the root, such as
 * `.evolu/.opaque/abc`, and the root's is empty.
 */
export type FakeOpfsCall =
  | {
      readonly method: Exclude<FakeOpfsMethod, "read" | "write" | "truncate">;
      readonly path: string;
    }
  | {
      readonly method: "read" | "write";
      readonly path: string;
      readonly at: number;
      readonly length: number;
    }
  | {
      readonly method: "truncate";
      readonly path: string;
      readonly size: number;
    };

/** What a {@link FakeOpfsFaultHook} makes a call do instead. */
export type FakeOpfsFault =
  /** Throw the error, or reject with it for an asynchronous method. */
  | { readonly type: "Throw"; readonly error: unknown }
  /**
   * For a read or write, return the count. A write then stores only the first
   * `count` bytes, or none when the count exceeds the length, and a read fills
   * only the first `count` bytes.
   */
  | { readonly type: "Count"; readonly count: number }
  /**
   * For a write or truncate, report success but change nothing, as when the
   * worker died before it.
   */
  | { readonly type: "Drop" }
  /** For an asynchronous method, wait for the promise, then apply `next`. */
  | {
      readonly type: "Delay";
      readonly until: Promise<void>;
      readonly next: FakeOpfsFault | null;
    };

/** Decides, for each call, whether it fails; null lets it run. */
export type FakeOpfsFaultHook = (call: FakeOpfsCall) => FakeOpfsFault | null;

/** An in-memory OPFS with fault injection. */
export interface FakeOpfs extends OpfsRootDep {
  /** Every call, in order. */
  readonly calls: ReadonlyArray<FakeOpfsCall>;

  /** Replaces the fault hook; null removes it. */
  readonly inject: (hook: FakeOpfsFaultHook | null) => void;

  /** Returns a copy of a file's bytes, or null when there is no such file. */
  readonly readFile: (path: string) => Uint8Array<ArrayBuffer> | null;

  /** Creates or replaces a file, and its directories, without any handle. */
  readonly writeFile: (path: string, bytes: Uint8Array) => void;

  /** Returns the names of a directory's files, in creation order. */
  readonly listFiles: (path: string) => ReadonlyArray<string>;

  /** Returns whether a directory exists. */
  readonly hasDirectory: (path: string) => boolean;

  /**
   * Holds a file's sync access handle as another context would, until the
   * returned function releases it.
   */
  readonly hold: (path: string) => () => void;

  /** Closes every open handle, as when the worker holding them ends. */
  readonly releaseHandles: () => void;
}

/** Options for {@link setupFakeOpfs}. */
export interface FakeOpfsOptions {
  /** What a second acquisition rejects with: WebKit uses `InvalidStateError`. */
  readonly heldErrorName?: "NoModificationAllowedError" | "InvalidStateError";
}

/** Creates an empty {@link FakeOpfs}. */
export const setupFakeOpfs = ({
  heldErrorName = "NoModificationAllowedError",
}: FakeOpfsOptions = {}): FakeOpfs => {
  const root: FakeDirectory = { kind: "directory", entries: new Map() };
  const calls: Array<FakeOpfsCall> = [];
  let hook: FakeOpfsFaultHook | null = null;
  const openHandles = new Set<FakeHandleState>();

  const record = (call: FakeOpfsCall): FakeOpfsFault | null => {
    calls.push(call);
    return hook?.(call) ?? null;
  };

  // Applies a fault to an asynchronous call: waits for a delay, throws.
  const applyAsync = async (
    fault: FakeOpfsFault | null,
  ): Promise<FakeOpfsFault | null> => {
    if (fault?.type === "Delay") {
      await fault.until;
      return applyAsync(fault.next);
    }
    if (fault?.type === "Throw") throw fault.error;
    return fault;
  };

  const applySync = (fault: FakeOpfsFault | null): FakeOpfsFault | null => {
    if (fault?.type === "Throw") throw fault.error;
    return fault;
  };

  const join = (path: string, name: string) =>
    path === "" ? name : `${path}/${name}`;

  const createFileHandle = (
    path: string,
    name: string,
    file: FakeFile,
  ): OpfsFileHandle => ({
    kind: "file",
    name,
    createSyncAccessHandle: async () => {
      await applyAsync(record({ method: "createSyncAccessHandle", path }));
      if (file.handle != null)
        throw new DOMException(
          "A sync access handle is already open for the file.",
          heldErrorName,
        );
      const state: FakeHandleState = { file, closed: false };
      file.handle = state;
      openHandles.add(state);
      return createSyncAccessHandle(path, state);
    },
  });

  const createSyncAccessHandle = (
    path: string,
    state: FakeHandleState,
  ): OpfsSyncAccessHandle => {
    const { file } = state;
    const assertOpen = () => {
      if (state.closed)
        throw new DOMException(
          "The sync access handle is closed.",
          "InvalidStateError",
        );
    };
    return {
      read: (buffer, { at }) => {
        const fault = applySync(
          record({ method: "read", path, at, length: buffer.length }),
        );
        assertOpen();
        const available = Math.max(0, Math.min(buffer.length, file.size - at));
        const count =
          fault?.type === "Count"
            ? Math.min(fault.count, available)
            : available;
        buffer.set(file.data.subarray(at, at + count));
        return fault?.type === "Count" ? fault.count : count;
      },
      write: (buffer, { at }) => {
        const fault = applySync(
          record({ method: "write", path, at, length: buffer.length }),
        );
        assertOpen();
        if (fault?.type === "Drop") return buffer.length;
        const count =
          fault?.type === "Count"
            ? fault.count <= buffer.length
              ? fault.count
              : 0
            : buffer.length;
        resize(file, Math.max(file.size, at + count));
        file.data.set(buffer.subarray(0, count), at);
        return fault?.type === "Count" ? fault.count : count;
      },
      truncate: (size) => {
        const fault = applySync(record({ method: "truncate", path, size }));
        assertOpen();
        if (fault?.type === "Drop") return;
        resize(file, size);
      },
      getSize: () => {
        applySync(record({ method: "getSize", path }));
        assertOpen();
        return file.size;
      },
      flush: () => {
        applySync(record({ method: "flush", path }));
        assertOpen();
      },
      close: () => {
        applySync(record({ method: "close", path }));
        state.closed = true;
        openHandles.delete(state);
        if (file.handle === state) file.handle = null;
      },
    };
  };

  const createDirectoryHandle = (
    path: string,
    directory: FakeDirectory,
  ): OpfsDirectoryHandle => ({
    kind: "directory",
    getDirectoryHandle: async (name) => {
      const childPath = join(path, name);
      await applyAsync(
        record({ method: "getDirectoryHandle", path: childPath }),
      );
      if (name === "") throw new TypeError("Name is not allowed.");
      let child = directory.entries.get(name);
      if (child?.kind === "file")
        throw new DOMException("The entry is a file.", "TypeMismatchError");
      if (child == null) {
        child = { kind: "directory", entries: new Map() };
        directory.entries.set(name, child);
      }
      return createDirectoryHandle(childPath, child);
    },
    getFileHandle: async (name) => {
      const childPath = join(path, name);
      await applyAsync(record({ method: "getFileHandle", path: childPath }));
      let child = directory.entries.get(name);
      if (child?.kind === "directory")
        throw new DOMException(
          "The entry is a directory.",
          "TypeMismatchError",
        );
      if (child == null) {
        child = createFile();
        directory.entries.set(name, child);
      }
      return createFileHandle(childPath, name, child);
    },
    values: () => ({
      [Symbol.asyncIterator]: async function* () {
        await applyAsync(record({ method: "values", path }));
        for (const [name, entry] of directory.entries)
          yield entry.kind === "file"
            ? createFileHandle(join(path, name), name, entry)
            : createDirectoryHandle(join(path, name), entry);
      },
    }),
  });

  const opfsRoot: OpfsRoot = {
    getDirectory: async () => {
      await applyAsync(record({ method: "getDirectory", path: "" }));
      return createDirectoryHandle("", root);
    },
  };

  const find = (path: string): FakeEntry | null => {
    let entry: FakeEntry = root;
    for (const name of path.split("/").filter((name) => name !== "")) {
      if (entry.kind !== "directory") return null;
      const child = entry.entries.get(name);
      if (child == null) return null;
      entry = child;
    }
    return entry;
  };

  return {
    opfsRoot,
    calls,
    inject: (newHook) => {
      hook = newHook;
    },
    readFile: (path) => {
      const entry = find(path);
      return entry?.kind === "file" ? entry.data.slice(0, entry.size) : null;
    },
    writeFile: (path, bytes) => {
      const names = path.split("/");
      const fileName = names.pop() ?? "";
      let directory = root;
      for (const name of names) {
        let child = directory.entries.get(name);
        if (child == null) {
          child = { kind: "directory", entries: new Map() };
          directory.entries.set(name, child);
        }
        if (child.kind !== "directory") throw new Error(`${name} is a file`);
        directory = child;
      }
      let file = directory.entries.get(fileName);
      if (file == null) {
        file = createFile();
        directory.entries.set(fileName, file);
      }
      if (file.kind !== "file") throw new Error(`${path} is a directory`);
      resize(file, 0);
      resize(file, bytes.length);
      file.data.set(bytes);
    },
    listFiles: (path) => {
      const entry = find(path);
      return entry?.kind === "directory"
        ? [...entry.entries]
            .filter(([, child]) => child.kind === "file")
            .map(([name]) => name)
        : [];
    },
    hasDirectory: (path) => find(path)?.kind === "directory",
    hold: (path) => {
      const entry = find(path);
      if (entry?.kind !== "file") throw new Error(`No file ${path}`);
      if (entry.handle != null) throw new Error(`${path} is already held`);
      const state: FakeHandleState = { file: entry, closed: false };
      entry.handle = state;
      return () => {
        state.closed = true;
        if (entry.handle === state) entry.handle = null;
      };
    },
    releaseHandles: () => {
      for (const state of openHandles) {
        state.closed = true;
        if (state.file.handle === state) state.file.handle = null;
      }
      openHandles.clear();
    },
  };
};

/**
 * Returns a {@link FakeOpfsFaultHook} that drops every write and truncate after
 * the k-th write, so the files stay as they were when a worker died there.
 */
export const crashAfterWrites = (k: number): FakeOpfsFaultHook => {
  let writes = 0;
  return (call) => {
    if (call.method !== "write" && call.method !== "truncate") return null;
    if (writes === k) return { type: "Drop" };
    if (call.method === "write") writes++;
    return null;
  };
};

/** A `QuotaExceededError` as Chromium throws it. */
export const createQuotaExceededError = (): DOMException =>
  new DOMException("The quota has been exceeded.", "QuotaExceededError");

type FakeEntry = FakeDirectory | FakeFile;

interface FakeDirectory {
  readonly kind: "directory";
  readonly entries: Map<string, FakeEntry>;
}

interface FakeFile {
  readonly kind: "file";
  data: Uint8Array<ArrayBuffer>;
  size: number;
  handle: FakeHandleState | null;
}

interface FakeHandleState {
  readonly file: FakeFile;
  closed: boolean;
}

const createFile = (): FakeFile => ({
  kind: "file",
  data: new Uint8Array(0),
  size: 0,
  handle: null,
});

/** Sets the size, zeroing the bytes a shrink drops so a grow reads zeros. */
const resize = (file: FakeFile, size: number): void => {
  if (size > file.data.length) {
    const data = new Uint8Array(Math.max(size, file.data.length * 2));
    data.set(file.data.subarray(0, file.size));
    file.data = data;
  } else if (size < file.size) file.data.fill(0, size, file.size);
  file.size = size;
};
