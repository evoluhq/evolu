/*
 * Evolu's encryption codec as a VFS shim over another VFS: unix natively, the
 * OPFS pool on the web. It encrypts a keyed main database page by page in the
 * format of evolu_page.h, and its rollback journal's records as pages of that
 * database, so SQLite itself, unmodified, never sees ciphertext and no file
 * holds plaintext, apart from the sampled sums EVOLU_CODEC_PLAINTEXT_CHECKSUMS
 * keeps.
 *
 * ## Opening
 *
 * - evolu_codec_open opens a database on a codec VFS, keyed when given a raw
 *   32-byte key, which reaches the database file's xOpen through a thread-local
 *   pointer for the duration of the call, so no read or write of the file
 *   happens unkeyed. The file takes it before the inner VFS opens it, so no
 *   database the inner VFS's xOpen opens meanwhile on the thread takes it. The
 *   key never appears in SQL, a URI or an error; the codec copies it into
 *   memory it allocates itself, not through SQLite's allocator, and the
 *   caller's key is never modified.
 * - A keyed open then asks for EVOLU_CODEC_RESERVED_SIZE reserved bytes at the
 *   end of each page, which takes effect for a new database, and turns
 *   secure_delete on. Every open then reads sqlite_schema, so a hot journal is
 *   rolled back and a wrong key or a file that isn't a database fails the open.
 * - Every connection evolu_codec_open opens is set up by evolu_core_register
 *   of evolu_skiplist.h, so it's defensive and has Evolu's SQL functions.
 * - Only a main database opened by evolu_codec_open is keyed. Its connection
 *   attaches a database read-only and creates none, since SQLite ignores the
 *   KEY clause of ATTACH. The output of VACUUM INTO is a plaintext file of its
 *   own.
 * - The codec VFS opens only a main database, its rollback journal and a
 *   super-journal, which holds only file names: native builds keep temporary
 *   files in memory (src/sqlite_config.h), as the wasm build does with
 *   SQLITE_TEMP_STORE=3, and the codec opens no WAL file. Its files
 *   lack the shared memory WAL needs, so SQLite keeps a database's journal
 *   mode. Under locking_mode = EXCLUSIVE, which needs none, and in a backup
 *   from a WAL database, a database, keyed or not, refuses a page 1 that says
 *   WAL (bytes 18 and 19 of 2) with SQLITE_IOERR_WRITE, recording
 *   EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED. SQLite switches the
 *   connection's journal mode before it writes that page, so the connection
 *   then reports journal_mode = WAL while it keeps writing a rollback journal.
 *
 * ## SQLCipher's files
 *
 * - With EVOLU_CODEC_SQLCIPHER_FILES, a keyed database also opens in
 *   SQLCipher 4's own layout, which expo-sqlite's databases have, told apart by
 *   which of page 1's layouts authenticates (evolu_page.h). Its page size,
 *   4096 bytes as expo-sqlite kept it, is encrypted, so page 1 decrypts at the
 *   size it stores and then at 4096. Either way, a page 1 counts only when it
 *   stores the size it decrypted at, which the default layout leaves
 *   unauthenticated. The file keeps its layout.
 * - Journal checksums are stored as SQLCipher stores them, so SQLite rolls back
 *   the hot journals SQLCipher left, and SQLCipher rolls back the codec's.
 *   The flag excludes EVOLU_CODEC_PLAINTEXT_CHECKSUMS.
 * - Without the flag, page 1 of such a file fails as with a wrong key. Opened
 *   with flags 0, a hot journal's records of other pages still authenticate
 *   with the salt of the database's first bytes and roll back, restoring their
 *   pages. A journal with a page-1 record stops there and is kept for an open
 *   with the flag. One without rolls back whole and is deleted, and the open
 *   then fails at page 1.
 *
 * ## Reads and writes
 *
 * - SQLite reads and writes a database a whole page at a time, at an offset
 *   that is a multiple of the page size. A whole page is read, authenticated
 *   and decrypted in place. One whose HMAC differs, because the key is wrong or
 *   the page was altered, is zero-filled and fails the read with SQLITE_NOTADB
 *   for page 1 and SQLITE_CORRUPT for any other page, recording
 *   EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION. A read that gets nothing is past
 *   the end and returns SQLITE_IOERR_SHORT_READ. A page that ends early was cut
 *   off or torn and fails as one whose HMAC differs, or zeros would pass as its
 *   data. The inner VFS's byte count of a short read comes from its file size.
 * - SQLite reads part of page 1 twice: its first 100 bytes when it opens a
 *   database, for the page size and the reserved bytes, and 16 bytes at offset
 *   24, the change counter. Any read within those first 100 bytes comes from
 *   page 1 decrypted when it authenticates and as stored when it doesn't, so a
 *   torn page 1 doesn't fail before a hot journal is rolled back. Any other
 *   read that isn't a whole page fails with SQLITE_IOERR_READ, recording
 *   EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED.
 * - A connection that opened the file while it was empty keeps SQLite's default
 *   page size, so when another connection creates the database with another
 *   page size, it reads page 1 whole at the wrong size. Page 1 is then
 *   decrypted at the size it stores, and the read gets its first bytes, with
 *   zeros past them, so SQLite learns the size and reads page 1 again.
 * - A whole page is encrypted with a fresh IV into the codec's buffer, never in
 *   SQLite's page cache, and written. Any other write, a page 1 that reserves
 *   other than EVOLU_CODEC_RESERVED_SIZE bytes, and a page 1 that stores
 *   another page size than its length, as a VACUUM after PRAGMA page_size
 *   writes it, fail with SQLITE_IOERR_WRITE, recording
 *   EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED, so SQLite rolls the statement
 *   back.
 * - PRAGMA key, hexkey, textkey, rekey, hexrekey and textrekey, which key and
 *   rekey a database in SQLCipher, and every pragma whose name starts with
 *   cipher fail with SQLITE_ERROR on every database of a codec VFS, keyed or
 *   not, recording EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED for the main
 *   database, the one evolu_codec_take_failure reads: plain SQLite
 *   ignores them, so a database keyed through SQL would be stored in
 *   plaintext. SQLite ignores other pragmas it doesn't know, such as
 *   SQLCipher's kdf_iter.
 * - SQLite must write every page it frees, or a page that a transaction added
 *   and freed would keep zeros, which fail to authenticate. So a keyed database
 *   refuses a PRAGMA secure_delete whose value isn't on, yes, true or 1,
 *   ignoring case, with SQLITE_ERROR and a message that says why.
 * - Its files report no device characteristics but powersafe overwrite, so
 *   SQLite never reads parts of pages, as its direct overflow reads do
 *   (SQLITE_IOCAP_SUBPAGE_READ), or skips the journal
 *   (SQLITE_IOCAP_BATCH_ATOMIC), and their I/O methods are version 1, without
 *   the shared memory and memory mapping through which SQLite would read around
 *   the codec, so PRAGMA mmap_size changes nothing.
 *
 * ## Journals
 *
 * - SQLite writes each record of a rollback journal as the page number in 4
 *   bytes, big-endian, the page, and a 4-byte checksum: an initializer the
 *   journal's header stores plus every 200th byte of the page. The page is
 *   encrypted as that page of the database, with a fresh IV, and the checksum
 *   is stored over the page as stored, as SQLCipher computes it, so the
 *   plaintext's bytes don't reach the file. Reading a record turns the stored
 *   checksum into the one SQLite computes over the decrypted page, which
 *   matches exactly when the stored one matched, so a stale or torn record
 *   still ends the journal. With EVOLU_CODEC_PLAINTEXT_CHECKSUMS, which the
 *   web passes, checksums stay as SQLite computes them, as @evolu/sqlite-wasm
 *   2.2.4 and the TypeScript codec of its 3.53.4-build1 to 3.54.0-build2 roll
 *   them back.
 * - A journal doesn't record which checksums it stores, so every open of a
 *   database must pass or omit EVOLU_CODEC_PLAINTEXT_CHECKSUMS as the
 *   connections that may have left its journal did. Otherwise, SQLite takes the
 *   first record whose stored and plaintext sums differ, almost always the
 *   first, for the journal's end and deletes the journal, leaving the
 *   transaction half-applied. So a platform never changes the flag for
 *   existing files.
 * - A read or write of a page size at offset P + 4, right after one of 4 bytes
 *   at P, is a record's page, unless those 4 bytes were the checksum right
 *   after the previous record's page. Once SQLite has written the journal's
 *   first header, only the page size it stores counts. Everything else, the
 *   headers, page numbers and super-journal name, is stored as it is.
 * - SQLite rolls a hot journal back before it reads the database's page 1,
 *   whose salt the records' HMAC key needs. So opening a journal that SQLite
 *   would roll back, whose first byte isn't 0 and whose first header stores an
 *   original size other than 0 pages, takes the salt from the first of these
 *   that authenticates: the database's page 1 at the page size it stores and,
 *   for SQLCipher's files, at 4096, and, for a page 1 a crash tore, the first
 *   page-1 record the rollback reaches with that record's salt. A journal kept
 *   by journal_mode = PERSIST or locking_mode = EXCLUSIVE can hold an earlier
 *   database's records past its own, so that record and every record before
 *   it must authenticate with its salt, and match its checksum where SQLite
 *   compares it, before any of them changes the codec. The codec reads the
 *   journal as SQLite's rollback does: segments of the records each header
 *   counts, 0 for none and 0xFFFFFFFF for those up to the end of the file, up
 *   to a record numbered 0 or with the lock-byte page, one the file doesn't
 *   hold whole or a checksum that differs, skipping a page above the original
 *   size without its checksum. When neither authenticates, it takes the
 *   database's first 16 bytes while no page 1 has proven the key, and keeps
 *   the salt once one has, because a database keeps its salt while it has
 *   pages and a tear must not replace it. Only this gives a journal's records
 *   their salt: a page-1 record with another salt never does.
 * - A wrong key, with which no page 1 authenticates, restores no page of a hot
 *   journal: SQLite only truncates the database to the original size its
 *   header stores, dropping pages the transaction appended, before the
 *   rollback fails at the first record, and the journal stays for the right
 *   key. A journal that a crash in the database's first transaction left is the
 *   exception, with a key or without: its header stores an original size of 0
 *   and it holds no record, so the rollback succeeds, emptying the database,
 *   and loses nothing committed. Once a page 1 has proven the key, read or
 *   written, as by the connection that creates the database, and the database's
 *   page 1 or the journal's page-1 record authenticates, a record's page that
 *   fails to authenticate ends the journal, as a checksum that differs ends it
 *   in SQLite, and so does a page-1 record that stores another salt, which a
 *   journal kept by journal_mode = PERSIST or locking_mode = EXCLUSIVE, or left
 *   before its first sync, can hold past the transaction's own records.
 * - Nor does a connection without a key: SQLite would take the first record,
 *   whose checksum then differs, as the end of the journal and delete it,
 *   leaving the transaction half-applied. So opening a hot journal of an
 *   unkeyed database whose first 16 bytes aren't SQLite's header string fails
 *   with SQLITE_CANTOPEN, recording EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED,
 *   unless the first page-1 record the rollback reaches, with every record
 *   before it matching its checksum, starts with that string, as a plaintext
 *   database's does when a crash tore its page 1.
 *   SQLite counts a journal it can't open as hot, and its rollback then can't
 *   open it either, so the statement fails and the journal stays for the key.
 *   Running out of memory while checking a journal fails its open with
 *   SQLITE_NOMEM instead, and the journal stays too.
 *
 * ## Threat model
 *
 * The codec protects the confidentiality of every page and the integrity of
 * each page on its own against someone who reads or alters the files without
 * the key. It doesn't protect against code running in the app's process; the
 * rollback or replay of an older page or a whole older file, since nothing
 * records freshness; denial of service through page 1's unauthenticated bytes
 * 16 to 23; with EVOLU_CODEC_PLAINTEXT_CHECKSUMS, the sums of sampled
 * plaintext bytes SQLite stores as each journal record's checksum, kept so the
 * web's older builds can roll back each other's journals, and kept for the
 * web's existing files (see Journals); or metadata, such as the number of
 * pages, which pages a transaction writes, and timing. Constant-time
 * primitives defend against observers sharing the CPU's caches. Constant time
 * holds for the C code, but wasm and its JIT compilers promise none. The
 * codec's copy of the key and the keys it derives share the process's memory
 * with SQLite's heap, in wasm one linear memory, so a memory-disclosure bug in
 * SQLite could reach them.
 *
 * Threads: each file, like each SQLite connection, is used from one thread at
 * a time. Registration is serialized, except in a build with
 * SQLITE_THREADSAFE=0, such as the wasm, which has one thread.
 */
#ifndef EVOLU_CODEC_H
#define EVOLU_CODEC_H

#include <stdint.h>

#include "evolu_page.h"
#include "sqlite3.h"

#ifdef __cplusplus
extern "C" {
#endif

#define EVOLU_CODEC_KEY_SIZE EVOLU_PAGE_KEY_SIZE

/* Lets evolu_codec_open open SQLCipher 4's files too, for React Native. */
#define EVOLU_CODEC_SQLCIPHER_FILES 1

/*
 * Keeps the journal record checksums SQLite computes over the plaintext, which
 * @evolu/sqlite-wasm 2.2.4 and the TypeScript codec of its 3.53.4-build1 to
 * 3.54.0-build2 read and write. A
 * database's opens must all pass it or all omit it, since a journal doesn't
 * record which checksums it stores.
 */
#define EVOLU_CODEC_PLAINTEXT_CHECKSUMS 2
#define EVOLU_CODEC_RESERVED_SIZE EVOLU_PAGE_RESERVED_SIZE

/*
 * The values are part of the ABI that bindings read, such as the web's, which
 * reads the failure from wasm memory.
 */
typedef enum {
  EVOLU_CODEC_FAILURE_NONE = 0,
  /* A page, page_number, failed to authenticate. */
  EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION = 1,
  /* SQLite asked for something the codec can't keep encrypted. */
  EVOLU_CODEC_FAILURE_ENCRYPTION_UNSUPPORTED = 2,
  /* The platform's random source failed during a write. */
  EVOLU_CODEC_FAILURE_RANDOM = 3,
} evolu_codec_failure_type;

/*
 * The first failure the codec recorded for a database since it was taken: 8
 * bytes, the type at 0 and the page number at 4, as evolu_codec.c asserts.
 */
typedef struct {
  evolu_codec_failure_type type;
  /* The page, for EVOLU_CODEC_FAILURE_PAGE_AUTHENTICATION; otherwise 0. */
  uint32_t page_number;
} evolu_codec_failure;

/*
 * Registers a codec VFS named name over the VFS named inner_name, or the
 * default VFS when it's NULL, without making it the default. Returns
 * SQLITE_OK, also when a codec VFS of that name over the same inner VFS is
 * registered already, SQLITE_ERROR when there's no such inner VFS or SQLite
 * fails to initialize, SQLITE_MISUSE when name is NULL, another VFS has the
 * name, or the inner VFS is a codec VFS, or SQLITE_NOMEM.
 */
int evolu_codec_register(const char *name, const char *inner_name);

/*
 * Opens the database filename on the codec VFS named vfs, read-write, created
 * when missing, with extended result codes and without SQLite's connection
 * mutex. With a key of EVOLU_CODEC_KEY_SIZE bytes, the database is encrypted;
 * with NULL, it's plaintext. Flags are 0, EVOLU_CODEC_SQLCIPHER_FILES or
 * EVOLU_CODEC_PLAINTEXT_CHECKSUMS; both, or any other bit, return
 * SQLITE_MISUSE with *db NULL, and so does a vfs that names no codec VFS. As
 * with sqlite3_open_v2, *db is set to the connection, unless memory runs out,
 * also when the open fails, and the caller closes it. Returns SQLITE_MISUSE
 * when a key was given but SQLite opened no database file through a codec VFS,
 * as for an in-memory database. Every connection it opens attaches databases
 * read-only.
 */
int evolu_codec_open(const char *filename, sqlite3 **db, const char *vfs,
                     const uint8_t *key, int flags);

/*
 * Moves the first failure the codec recorded for db's main database into
 * *failure and clears it. Returns SQLITE_NOTFOUND when the main database isn't
 * open on a codec VFS and SQLITE_MISUSE when db is NULL.
 */
int evolu_codec_take_failure(sqlite3 *db, evolu_codec_failure *failure);

#ifdef __cplusplus
}
#endif

#endif
