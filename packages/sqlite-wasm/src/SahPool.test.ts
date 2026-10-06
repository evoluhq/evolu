import {
  assertEqual,
  assertErr,
  assertOk,
  assertSame,
  assertType,
  type Brand,
  type NonEmptyReadonlyArray,
} from "@evolu/common";
import { test } from "node:test";
import {
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_MAIN_JOURNAL,
  SQLITE_OPEN_MEMORY,
  SQLITE_OPEN_READWRITE,
  SQLITE_OPEN_SUPER_JOURNAL,
  SQLITE_OPEN_WAL,
} from "./Constants.ts";
import {
  computeSahPoolDigest,
  OpfsName,
  openSahPool,
  sahPoolDefaultCapacity,
  sahPoolDigestV2Flag,
  sahPoolHeaderCorpusSize,
  sahPoolHeaderDigestOffset,
  sahPoolHeaderFlagsOffset,
  sahPoolHeaderPathSize,
  sahPoolHeaderSize,
  sahPoolOpaqueDirectoryName,
  sahPoolPersistentFileTypes,
  type OpfsNameError,
  type SahPoolOptions,
} from "./SahPool.ts";

// https://fs.spec.whatwg.org/#valid-file-name
test("OpfsName accepts a valid file name of the File System Standard and rejects an empty name, . and .., and a name with / or \\, a separator on Windows, with OpfsNameError", () => {
  for (const value of [
    ".evolu",
    "evolu1.db",
    "...",
    " ",
    "a b",
    "žluťoučký kůň",
    "日本語",
    "😀",
  ])
    assertOk(OpfsName.fromUnknown(value), value);
  for (const value of ["", ".", "..", "a/b", "a\\b", "/", "\\", "./", "a/"])
    assertErr(OpfsName.fromUnknown(value), { type: "OpfsName", value });

  assertSame(
    OpfsName.formatError({ type: "OpfsName", value: "a/b" }),
    'The value "a/b" is not a valid OpfsName.',
  );
  assertType<OpfsName, string & Brand<"OpfsName">>();
  assertType<typeof OpfsName.Error, OpfsNameError>();
});

test("OpfsName rejects a name with NUL or a lone surrogate, which SQLite or an engine reads as another name, with OpfsNameError", () => {
  assertOk(OpfsName.fromUnknown("\uFFFD"));
  for (const value of ["\0", "a\0b", "\uD800", "a\uDC00b", "\uDC00\uD800"])
    assertErr(OpfsName.fromUnknown(value), { type: "OpfsName", value });
});

test("OpfsName rejects a name not in Unicode NFC, which names the directory of its NFC spelling in WebKit on macOS, with OpfsNameError", () => {
  assertOk(OpfsName.fromUnknown("\u00E9"));
  assertErr(OpfsName.fromUnknown("e\u0301"), {
    type: "OpfsName",
    value: "e\u0301",
  });
});

test("openSahPool takes the directory as a non-empty array of OpfsName", () => {
  assertType<SahPoolOptions["directory"], NonEmptyReadonlyArray<OpfsName>>();
  openSahPool({ directory: [OpfsName.orThrow("a"), OpfsName.orThrow("b")] });

  // @ts-expect-error A directory is an array of OpfsName, not a path string.
  openSahPool({ directory: ".evolu" });
  // @ts-expect-error A directory has at least one OpfsName.
  openSahPool({ directory: [] });
  // @ts-expect-error A name is an OpfsName, which validation proves, not a string.
  openSahPool({ directory: [".evolu"] });
});

/** A header's path and big-endian flags, which the digest covers. */
const createCorpus = (path: string, flags: number): Uint8Array => {
  const corpus = new Uint8Array(sahPoolHeaderCorpusSize);
  new TextEncoder().encodeInto(path, corpus);
  new DataView(corpus.buffer).setUint32(sahPoolHeaderFlagsOffset, flags);
  return corpus;
};

test("the header layout and pool constants are opfs-sahpool's", () => {
  assertEqual(
    [
      sahPoolHeaderSize,
      sahPoolHeaderPathSize,
      sahPoolHeaderFlagsOffset,
      sahPoolHeaderCorpusSize,
      sahPoolHeaderDigestOffset,
      sahPoolDigestV2Flag,
      sahPoolPersistentFileTypes,
      sahPoolOpaqueDirectoryName,
      sahPoolDefaultCapacity,
    ],
    [
      4096,
      512,
      512,
      516,
      516,
      SQLITE_OPEN_MEMORY,
      SQLITE_OPEN_MAIN_DB |
        SQLITE_OPEN_MAIN_JOURNAL |
        SQLITE_OPEN_SUPER_JOURNAL |
        SQLITE_OPEN_WAL,
      ".opaque",
      6,
    ],
  );
});

// The vectors come from opfs-sahpool's computeDigest in SQLite trunk
// ac5f698ccb (public domain), run on the same corpora.
test("computeSahPoolDigest matches opfs-sahpool's digest for V2 headers, including bytes of 0x80 and above and long paths", () => {
  const v2 = sahPoolDigestV2Flag;
  const highBytes = createCorpus("", SQLITE_OPEN_MAIN_DB | v2);
  for (let index = 0; index < sahPoolHeaderPathSize; index++)
    highBytes[index] = 0x80 + (index % 128);

  for (const [corpus, flags, digest] of [
    [
      createCorpus(
        "/my.db",
        SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | v2,
      ),
      SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | v2,
      [733623307, 1377321499],
    ],
    [
      createCorpus(
        "/my.db-journal",
        SQLITE_OPEN_MAIN_JOURNAL |
          SQLITE_OPEN_READWRITE |
          SQLITE_OPEN_CREATE |
          v2,
      ),
      SQLITE_OPEN_MAIN_JOURNAL |
        SQLITE_OPEN_READWRITE |
        SQLITE_OPEN_CREATE |
        v2,
      [2999105150, 2527126710],
    ],
    [
      createCorpus("/žluťoučký kůň.db", SQLITE_OPEN_MAIN_DB | v2),
      SQLITE_OPEN_MAIN_DB | v2,
      [2971795857, 1848248641],
    ],
    [
      createCorpus(`/${"a".repeat(509)}`, SQLITE_OPEN_MAIN_DB | v2),
      SQLITE_OPEN_MAIN_DB | v2,
      [3503626032, 3496446816],
    ],
    [createCorpus("", v2), v2, [119094703, 3552220663]],
    [highBytes, SQLITE_OPEN_MAIN_DB | v2, [3258915406, 481079430]],
  ] as const)
    assertEqual([...computeSahPoolDigest(corpus, flags)], digest);
});

test("computeSahPoolDigest is the legacy [0, 0] without sahPoolDigestV2Flag", () => {
  const flags =
    SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;

  assertEqual(
    [...computeSahPoolDigest(createCorpus("/my.db", flags), flags)],
    [0, 0],
  );
});
