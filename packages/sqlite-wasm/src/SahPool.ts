/**
 * A VFS over a pool of OPFS sync access handles, byte-compatible with SQLite's
 * opfs-sahpool.
 *
 * Every file is a `FileSystemSyncAccessHandle` the pool holds exclusively, so
 * reads and writes are synchronous in the worker, with no helper worker and no
 * cross-origin isolation. As in opfs-sahpool, one pool may use a directory at a
 * time, across workers and wasm instances, so the caller must serialize opens
 * of a directory, as Evolu does with its leader Web Lock.
 *
 * Status: implemented, and tested in Node.js over a fake OPFS, including the
 * lock table and recovery after a worker died, and in workers of Chromium,
 * Firefox and WebKit on real OPFS, including storage quotas, real in Chromium
 * and Firefox, and pools shared with SQLite's opfs-sahpool as
 * `@evolu/sqlite-wasm` 2.2.4 ships it. Encryption is tested in Node.js over a
 * fake OPFS, against 2.2.4 and `node:crypto`, and in the three engines on real
 * OPFS against 2.2.4, which opens what the pool writes and the reverse, also
 * after either's worker was terminated mid-transaction.
 *
 * ## On-disk format
 *
 * The slots must stay byte for byte what opfs-sahpool writes. Existing users'
 * pools, and older tabs and cached PWAs running SQLite's JavaScript, share the
 * directory, and opfs-sahpool wipes any slot whose header it does not accept.
 *
 * - The pool creates only {@link sahPoolOpaqueDirectoryName} in the pool
 *   directory, such as `.evolu`, with one randomly named file per slot.
 * - Each slot starts with a {@link sahPoolHeaderSize}-byte header. Bytes 0-511
 *   hold the path in UTF-8, NUL-padded, so `xOpen` rejects a path of 511 bytes
 *   or more with SQLITE_CANTOPEN, and a database's path longer than
 *   {@link sahPoolMaxDatabasePathSize}, 498 bytes, whose super-journal's path
 *   would be that long, before it takes a slot. Bytes 512-515 hold the
 *   `SQLITE_OPEN_*` flags as a big-endian u32. Bytes 516-523 hold the digest as
 *   two platform-endian u32 values, which is little-endian everywhere Evolu
 *   runs.
 * - File data starts at offset {@link sahPoolHeaderSize}.
 * - A free slot has an all-zero path, flags 0 and digest `[0, 0]`, and is
 *   normally exactly {@link sahPoolHeaderSize} bytes long. A failed truncate can
 *   leave it longer, and the `xOpen` that takes it truncates it first.
 * - Paths are normalized with `new URL(name, "file://localhost/").pathname`, so
 *   `file:evolu1.db` and `evolu1.db` both become `/evolu1.db`, and the journal
 *   `/evolu1.db-journal`. URL paths percent-encode characters such as spaces
 *   and non-ASCII ones. A host is ignored, as in opfs-sahpool, because engines
 *   parse it differently. A name is rejected unless its path with `-journal`
 *   appended is the path of the name with `-journal` appended. Otherwise the
 *   suffix lands in a query, a fragment or a host, as for `/a?b.db`, `/a#b.db`
 *   or `//evolu.db`, mapping the database and its journal to one path.
 *
 * ## Setup
 *
 * - Setup does not serialize opens of a directory; the caller must, as
 *   opfs-sahpool documents. A held slot fails an open, but two openers of a new
 *   or empty directory list no slot to hold, and each can create its own slots.
 *   A file both then create exists twice, and on the next open only one version
 *   shows, while the other is kept hidden and never reused, as below. In WebKit
 *   on macOS, names that differ only in case name one directory, so spell each
 *   directory in one case, as {@link OpfsName} describes.
 * - Every slot's handle is acquired, in the default exclusive mode and never
 *   `readwrite-unsafe`, before anything is written. Setup waits for every
 *   acquisition to settle before it gives up, then closes every handle it
 *   obtained, including those that resolve after the first rejection. No header
 *   is read, repaired or truncated until every slot is held.
 * - Opening a directory this instance has open, or is opening, also while it
 *   waits for held slots, fails with {@link SahPoolAlreadyOpenError} before it
 *   touches OPFS. The claim is released when setup fails or the pool is
 *   disposed.
 * - When another context or instance still holds a slot, setup writes nothing,
 *   closes every handle it acquired, and fails with {@link SahPoolHeldError},
 *   even when another slot fails otherwise. With
 *   {@link SahPoolOptions.heldTimeout}, it first tries again from a new listing
 *   until the timeout passes, holding no slot in between. Handles can outlive a
 *   Web Lock an app serializes workers with, such as Evolu's: WebKit releases
 *   the two in no set order when a worker ends without closing its database,
 *   and Chromium keeps them for a page in the back/forward cache until it is
 *   evicted, and after site data is cleared on Windows until the browser
 *   restarts. Chromium also lets a worker that `Worker.terminate()` ended
 *   finish the task it runs, holding its handles, for up to two seconds.
 * - Each header is read into a zeroed buffer, so a short slot is not parsed with
 *   the previous slot's bytes, then classified as opfs-sahpool does: a
 *   transient or DELETEONCLOSE file, or a bad digest, is freed; a valid free
 *   slot is truncated to the header. Of slots whose headers map the same path,
 *   which two openers of a new or empty directory can leave, the one listed
 *   last maps the path, and the others stay unused, as in opfs-sahpool: no
 *   other file truncates, writes or reuses them. Unlike opfs-sahpool, deleting
 *   the path frees them too, so the deleted file does not come back on the next
 *   open.
 * - Slots are topped up to {@link sahPoolDefaultCapacity}.
 * - Any other failure, such as OPFS refusing access, a header that cannot be read
 *   or written, or a VFS that cannot be allocated or registered, fails with
 *   {@link SahPoolSetupError}. Every handle setup obtained is closed, also when
 *   setup throws. In a SharedWorker, Chromium and Firefox have no
 *   `createSyncAccessHandle`, as the spec says, so setup fails there with a
 *   `TypeError` as the cause; WebKit has sync access handles in SharedWorkers
 *   too.
 * - The directory is never removed. 2.2.4 removed it, database included, when
 *   setup failed.
 *
 * ## Locking
 *
 * - Locks live in a table per path, like `unixInodeInfo` in SQLite's `os_unix.c`,
 *   because several connections of one worker can open the same path. A lock
 *   that conflicts with another connection's lock returns SQLITE_BUSY, and a
 *   failed step from RESERVED to EXCLUSIVE leaves PENDING, which admits no new
 *   SHARED locks.
 * - The table accepts every sequence SQLite makes, as `unixLock` and
 *   `posixUnlock` in `os_unix.c` do: an `xLock` at or below the connection's
 *   level does nothing; RESERVED to EXCLUSIVE goes through PENDING, but SHARED
 *   straight to EXCLUSIVE, as a hot journal's rollback asks, takes no PENDING
 *   when it fails; `xUnlock` goes from any level to SHARED or NONE, and
 *   `xClose` to NONE. Each connection's own level guards the shared per-path
 *   state, so an unlock from a connection that never locked changes nothing.
 *   `xRead` and `xFileControl` work with no lock held.
 * - `xCheckReservedLock` reports whether any connection holds more than SHARED on
 *   the path. The exclusive handles make this pool the only writer of its
 *   slots, so the answer is authoritative, and SQLite rolls back a hot journal
 *   left by an interrupted commit. opfs-sahpool always answered yes until
 *   SQLite fixed it on 2026-09-30, so such a transaction stayed half-applied.
 * - `xSleep` does nothing. Contention can only come from connections in the same
 *   thread, which sleeping cannot resolve.
 *
 * ## I/O errors
 *
 * - Every method catches everything and returns a result code, and records the
 *   first failure since {@link SahPool.clearFailure} as a
 *   {@link SqliteVfsFailure}. `xGetLastError` never clears it.
 * - Every write's returned byte count is checked, header writes included. When
 *   storage is full, Chromium off the record returns 0xFFFFFFF8 and Firefox a
 *   short count instead of throwing.
 * - `xWrite` returns SQLITE_FULL when the handle wrote a different number of
 *   bytes than requested, recording a {@link SqliteShortWriteError}, or threw an
 *   error named `QuotaExceededError`, matched by name so subclasses and
 *   non-DOMException errors count. Any other error, including WebKit's
 *   `InvalidStateError` on a full disk, returns SQLITE_IOERR_WRITE.
 * - Over its quota, Chromium throws `QuotaExceededError`, and Firefox writes what
 *   fits, if anything, and returns the short count. Chromium reserves quota for
 *   a handle ahead of its writes and releases what the file does not use only
 *   when the handle closes, so a file the pool deletes frees no quota for the
 *   pool's other files until the pool is opened again.
 * - For an unencrypted file or a journal, `xRead` zero-fills the rest of a short
 *   read and returns SQLITE_IOERR_SHORT_READ, as SQLite requires. A page of an
 *   encrypted database that ends early fails as one whose HMAC differs, as
 *   Reads and writes under Encryption describes.
 * - Other methods return their specific code, such as SQLITE_IOERR_TRUNCATE,
 *   SQLITE_IOERR_FSYNC or SQLITE_IOERR_FSTAT, so the extended code says which
 *   operation failed.
 * - Exporting a database fails when the pool recorded a failure during the
 *   export, because SQLite zero-fills a page it cannot read and reports
 *   success.
 *
 * ## Files
 *
 * - `xOpen` with CREATE takes a free slot. A slot that is longer than the header,
 *   because an earlier shrink failed, is truncated first; if reading its size
 *   or truncating it fails, the open fails rather than letting a new journal
 *   inherit stale bytes, with SQLITE_FULL when `xWrite` would return it, and
 *   with SQLITE_CANTOPEN otherwise. With no free slot, the open fails with
 *   SQLITE_CANTOPEN and records a {@link SahPoolFullError}. A failed open leaves
 *   `pMethods` NULL, so SQLite does not call `xClose`.
 * - A file without a name fails `xOpen` with SQLITE_CANTOPEN. SQLite opens one
 *   only for a temporary file, which this build keeps in memory, and every one
 *   would share a path. It is also the only file SQLite opens with
 *   DELETEONCLOSE, so `xClose` deletes no file. A name that is no valid URL
 *   path, such as `//[`, or whose suffix would not land in its path, fails
 *   `xOpen` with SQLITE_CANTOPEN and `xDelete` with SQLITE_IOERR_DELETE, and
 *   `xAccess` finds no file.
 * - `xOpen` with CREATE and EXCLUSIVE, as SQLite opens a super-journal, fails
 *   with SQLITE_CANTOPEN when the path exists, as unix's O_EXCL does. It
 *   records no failure, because SQLite checks with `xAccess` that the path is
 *   free first.
 * - Before writing a new file's header, `xOpen` flushes the free slot, and every
 *   slot whose free header's flush failed, as below. That makes the truncate a
 *   delete, setup or an opfs-sahpool tab left unflushed durable before the path
 *   is. Otherwise a power loss can keep the new header but not the truncate,
 *   and SQLite reads the previous file's bytes. A deleted journal comes back
 *   hot and rolls a committed transaction back, wholly or partly, or corrupts
 *   the database, and a new database is NOTADB. A failed flush fails the open
 *   with SQLITE_IOERR_FSYNC, and the slot stays free. The header itself is
 *   written without a flush, because SQLite syncs a file before it relies on
 *   it. A failed header write fails the open with SQLITE_FULL when `xWrite`
 *   would return it, and with SQLITE_CANTOPEN otherwise, and the slot stays
 *   free.
 * - Deleting a file writes and flushes the free header first, which is the
 *   durable delete, and only then forgets the path and truncates the slot.
 *   Slots that its slot shadows are freed the same way before it. If writing a
 *   header fails before it changes a byte, the path stays mapped, its slot is
 *   not freed, and `xDelete` returns SQLITE_IOERR_DELETE, so SQLite rolls back
 *   from an intact journal. Once a byte changed, the header names no path on
 *   disk, so a short write, a failed flush or a failed truncate still succeeds,
 *   and a committed transaction is not reported as an error. Deleting a path
 *   the pool does not have succeeds, as in opfs-sahpool.
 * - A free header whose flush failed is flushed again before the pool writes any
 *   later header, as the first sync of a new journal in unix syncs its
 *   directory, and so is every slot free when the pool opened, because the pool
 *   whose flush of it failed may have ended first, as when its worker died. It
 *   is also flushed before the pool truncates a file, because SQLite truncates
 *   a database that shrank right after deleting its journal, and a journal that
 *   came back over the shorter file would lack the cut pages, as unix orders an
 *   unlink before a later truncate. When that flush fails again, an open fails
 *   before it takes a slot, a delete before it frees the path's slot, keeping
 *   the path mapped, and a truncate before it changes the file, with
 *   SQLITE_IOERR_TRUNCATE, so a COMMIT can fail although it committed, leaving
 *   the file longer than its database, which SQLite ignores and a later
 *   shrinking commit truncates. So a power loss can bring back only the file
 *   deleted last: a journal then rolls back its database's last commit as a
 *   whole, or repeats the rollback that deleted it, as SQLite accepts in
 *   synchronous FULL, which does not sync the directory after deleting a
 *   journal. When SQLite asks for a durable delete, as for a journal in
 *   synchronous EXTRA and for every super-journal, `xDelete` flushes again, and
 *   when that fails, returns SQLITE_IOERR_DIR_FSYNC although the file is
 *   deleted, as unix does when syncing the directory fails.
 * - {@link SahPool.unlink} deletes a database's `-journal` and `-wal` paths too,
 *   although SQLite deletes a leftover journal of an empty database anyway. It
 *   deletes the database before its journal, and the journal only once the
 *   database's free header is flushed, so neither a failure nor a power loss
 *   leaves the database without the journal that would roll it back. It throws
 *   when a connection has one of the files open, because its slot would be
 *   reused under it.
 * - Each slot is mapped to exactly one path, free, or unused because a slot
 *   listed after it maps its path, until that path is deleted.
 *
 * ## Encryption
 *
 * The pool encrypts a database as SQLite3 Multiple Ciphers encrypts it with its
 * `sqlcipher` scheme and that scheme's default parameters, those of SQLCipher
 * 4, so the databases `@evolu/web` 3 encrypted with `@evolu/sqlite-wasm` 2.2.4
 * open unchanged, and 2.2.4 opens what the pool writes. SQLite3 Multiple
 * Ciphers writes SQLCipher 4's pages except that page 1 keeps bytes 16 to 23
 * unencrypted, and so does the pool.
 *
 * `@evolu/web` 1.0.1-preview.6 to 2.4.0 also ran `PRAGMA legacy = 4`, which
 * writes SQLCipher 4's own format: 4096-byte pages, and page 1 encrypted and
 * authenticated from byte 16. Those databases have not opened since
 * `@evolu/web` 3.0.0, which dropped the pragma, and the pool does not open
 * them: page 1 fails to authenticate. Reading them, to migrate them later,
 * needs the page size, 4096, before page 1 is decrypted, because SQLite reads
 * it from the encrypted bytes 16 and 17, and page 1 authenticated and decrypted
 * from byte 16 to its reserved bytes, 4000 bytes in whole AES blocks, so
 * without ciphertext stealing. Like the databases of `@evolu/web` 3, they were
 * keyed with the `x'<hex>'` text, so their key is the one
 * {@link deriveLegacySqliteKey} derives.
 *
 * ### Keys
 *
 * - {@link SahPool.registerKey} registers a raw 32-byte key for a path until the
 *   registration is disposed. The path is a {@link SqliteVfsPath}, the path
 *   `xOpen` maps the file's name to, so it is registered as it is, and
 *   registering a path again before its registration is disposed throws. Only
 *   an `xOpen` of the path as a main database takes the key, copying it: that
 *   file and its rollback journal are then encrypted until the file closes,
 *   which zeroes the copy and the HMAC key derived from it. Disposing the
 *   registration zeroes its copy, and the caller's key is never modified.
 * - Each open file has its own copy, so connections that open the same path with
 *   different keys do not share one. A journal belongs to the database whose
 *   name its name leads back to, as `sqlite3_filename_database` finds it.
 * - The key never reaches SQLite: no SQL, URI, file name or memory of SQLite
 *   holds it, and no error or recorded failure contains it.
 *
 * ### Pages
 *
 * - Every page ends with 80 reserved bytes: a random 16-byte IV, then a 64-byte
 *   HMAC. The bytes before them, from byte 24 of page 1 and from byte 0 of any
 *   other page, are encrypted with AES-256-CBC, the key and the IV.
 * - Page 1's encrypted bytes are not a whole number of 16-byte blocks. Their last
 *   partial block is encrypted with ciphertext stealing, CBC-CS3: the last
 *   whole block of ciphertext C is replaced by the encryption of C XOR the
 *   partial block padded with zeros, followed by the first bytes of C, as many
 *   as the partial block has.
 * - Bytes 0 to 15 of page 1 hold the salt instead of SQLite's header string,
 *   which decryption restores. Bytes 16 to 23, the page size, the file format
 *   versions, the reserved bytes and the payload fractions, stay unencrypted
 *   and unauthenticated, so SQLite learns the page size and the reserved bytes
 *   before anything is decrypted. A page 1 whose reserved bytes are not 80
 *   fails as an altered page, because SQLite would read every page at another
 *   usable size, and a blob that overflows its page would read as other bytes.
 * - The HMAC is HMAC-SHA512 of the encrypted bytes, the IV and the page number as
 *   a little-endian u32. Its key is PBKDF2-HMAC-SHA512 of the key, salted with
 *   the salt XOR 0x3a, with 2 iterations and 32 bytes. A page is authenticated,
 *   comparing in constant time, before it is decrypted.
 * - The salt is what page 1 stores. The pool learns it from a read of page 1,
 *   whole or in part, that authenticates, which SQLite makes before it reads or
 *   writes any other page of a database that has pages. A page 1 that fails to
 *   authenticate, as a stale page in a journal or a page a power loss tore can,
 *   gives no salt, or every page written later would get its salt. A new
 *   database gets 16 random bytes when the first of its pages is written. The
 *   HMAC key is derived again, and the previous one zeroed, whenever the salt
 *   changes, such as to one another connection wrote.
 * - SQLite rolls a hot journal back before it reads page 1, so a connection can
 *   have no salt, as when it opened the database while it was empty, or a stale
 *   one, as when the database was emptied and created again since a page 1
 *   proved its key. So `xOpen` of a journal that SQLite would roll back, whose
 *   first byte is not 0 and whose first header stores an original size other
 *   than 0 pages, takes the salt from the first of these that authenticates:
 *   the journal's first page-1 record, as below, and the database's page 1,
 *   read at the page size it stores. When neither does, it takes the database's
 *   first 16 bytes while no page 1 has proven the key, and keeps the salt once
 *   one has, because a database keeps its salt while it has pages and a tear
 *   must not replace it. The kept salt is stale only when the database was
 *   created again since, which needs `synchronous = OFF` and a power loss,
 *   where SQLite promises nothing either: otherwise, SQLite syncs the journal's
 *   page-1 record before it writes page 1, so one of the two authenticates. It
 *   takes no salt when the database is empty, or when the original size is 0
 *   pages: such a journal journals no page, and the database's first bytes are
 *   then a hole a spill left before page 1 was written. When a read throws, the
 *   open fails with SQLITE_CANTOPEN, recording what it threw.
 * - Any power of two from 1024 to 65536 bytes is a page size. SQLite raises a
 *   requested 512 to 1024, because a page reserves more than 32 bytes, as with
 *   SQLite3 Multiple Ciphers. A new database gets SQLite's default, 8192 bytes
 *   in this build, as in 2.2.4, unless `PRAGMA page_size` sets another before
 *   its first write.
 * - An existing database's page size cannot change. A VACUUM after `PRAGMA
 *   page_size` sets another size writes page 1 with that size in its header but
 *   in pages of the old size, so every later read of page 1 would fail to
 *   authenticate. Writing a page 1 whose header stores another page size than
 *   its length fails with SQLITE_IOERR_WRITE and records a
 *   {@link SahPoolEncryptionUnsupportedError}, so SQLite rolls the VACUUM back
 *   and the database stays as it was. SQLite3 Multiple Ciphers patches VACUUM
 *   to keep the old page size instead, so in 2.2.4 such a VACUUM succeeds with
 *   the old size. A VACUUM that keeps the page size, and `auto_vacuum`, work.
 * - SQLite must leave the 80 bytes unused. An existing database's header says so,
 *   and for a new one, the database layer asks for them with
 *   SQLITE_FCNTL_RESERVE_BYTES before its first write. Writing a page 1 whose
 *   header reserves another number of bytes fails with SQLITE_IOERR_WRITE and
 *   records a {@link SahPoolEncryptionUnsupportedError}: with fewer, the IV and
 *   the HMAC would overwrite data, and with more, page 1 would fail every
 *   read.
 * - SQLite must write every page it frees. With `secure_delete` off or `FAST`, it
 *   does not write a page that a transaction added and then freed, so the file
 *   keeps zeros there, which fail to authenticate, and an export, which reads
 *   every page, fails with SQLITE_CORRUPT. So for an encrypted database,
 *   `xFileControl` refuses a `PRAGMA secure_delete` whose value is not `on`,
 *   `yes`, `true` or `1`, ignoring case: the pragma fails with SQLITE_ERROR and
 *   a message that says why, recording a
 *   {@link SahPoolEncryptionUnsupportedError}, or with SQLITE_NOMEM when the
 *   message cannot be allocated. A query of the pragma works, and an
 *   EncryptedFile database turns it on. SQLite gives an attached database
 *   `main`'s setting, and applies a pragma without a schema to every attached
 *   database but asks only `main`'s file, so an encrypted database attached to
 *   a connection whose `main` is not encrypted can have it off. SQLite3
 *   Multiple Ciphers lets `secure_delete` be turned off, and 2.2.4's export
 *   returns zeros for such pages without an error.
 *
 * ### Reads and writes
 *
 * - SQLite reads and writes a database one whole page at a time, at an offset
 *   that is a multiple of the page's size, which is the page's number less one
 *   times the size.
 * - A whole page is read, authenticated and decrypted in place. A page whose HMAC
 *   differs, because the key is wrong or the page was altered, is zero-filled
 *   and fails the read with SQLITE_NOTADB for page 1 and SQLITE_CORRUPT for any
 *   other page, as SQLite3 Multiple Ciphers fails it, and records a
 *   {@link SqlitePageAuthenticationError}. A short read zero-fills the whole
 *   page, so no ciphertext reaches SQLite as data. A read that gets nothing is
 *   past the end, as page 1 of an empty file is, and returns
 *   SQLITE_IOERR_SHORT_READ. SQLite reads a page only within the file, so a
 *   page that ends early was cut off or torn and fails as one whose HMAC
 *   differs, or zeros would pass as its data, which no integrity check notices
 *   in an overflow page.
 * - SQLite reads part of page 1 twice: its first 100 bytes when it opens a
 *   database, for the page size and the reserved bytes, and 16 bytes at offset
 *   24, the change counter, when a transaction starts with pages cached. Both
 *   come from page 1 decrypted when it authenticates, and as stored when it
 *   does not, as SQLite3 Multiple Ciphers returns them before a key is set. So
 *   an open learns the unencrypted page size, a page 1 that a crash left torn
 *   does not fail before the key rolls a hot journal back, as below, and a
 *   wrong key fails when page 1 is read whole. A read that is not a whole page
 *   and ends past page 1, by the page size page 1 stores, fails with
 *   SQLITE_IOERR_READ and records a {@link SahPoolEncryptionUnsupportedError}.
 * - A connection that opened the file while it was empty keeps SQLite's default
 *   page size, so when another connection then creates the database with
 *   another page size, it reads page 1 whole at the wrong size. Page 1 is then
 *   authenticated and decrypted at the size it stores, and the read gets its
 *   first bytes, with zeros past it, so SQLite learns the size and reads page 1
 *   again; it fails as a whole page fails. In 2.2.4, such a connection failed
 *   with SQLITE_NOTADB until it was opened again.
 * - A whole page is encrypted with a fresh IV into a buffer of the pool, never in
 *   SQLite's page cache, and written. Any other write fails with
 *   SQLITE_IOERR_WRITE and records a {@link SahPoolEncryptionUnsupportedError}.
 *
 * ### Journals and other files
 *
 * - SQLite writes each record of a rollback journal as the page number in 4
 *   bytes, big-endian, the page, and a 4-byte checksum of the page as SQLite
 *   has it. The page is encrypted as that page of the database, with a fresh
 *   IV, and authenticated and decrypted when it is read, failing as a database
 *   page fails until the key is proven, as below. A read or write of a page's
 *   size at offset P + 4, right after one of 4 bytes at P, is a record's page,
 *   unless those 4 bytes were the checksum right after the previous record's
 *   page. Everything else, the headers, page numbers, checksums and
 *   super-journal name, is stored as it is.
 * - A crash can leave zeros in the first bytes of the database's page 1, whose
 *   salt the records need, and a plain UPDATE journals page 1 last, when its
 *   commit changes the change counter, so the journal's page-1 record, wherever
 *   it is, gives the salt first, as above. The pool finds the first such record
 *   as SQLite reads a hot journal: the sector and page sizes from the first
 *   header, and segments that each start with a header at a multiple of the
 *   sector size, with SQLite's magic and the number of records that follow it,
 *   where 0xFFFFFFFF counts them up to the end of the journal. A count of 0
 *   does too, although SQLite's rollback of a hot journal takes it as none,
 *   because any page 1 that authenticates stores the database's salt.
 * - So a wrong key, with which page 1 never authenticates, never rolls back a hot
 *   journal: the rollback fails at the first page, and the journal stays for
 *   the right key.
 * - Nor does a connection without a key. SQLite would read the journal's pages as
 *   stored, take the first record, whose checksum then differs, as the end of
 *   the journal, and delete it, leaving the transaction half-applied. So
 *   `xOpen` of a journal that exists, whose database is open without a key,
 *   reads the database's first 16 bytes, and fails with SQLITE_CANTOPEN when
 *   the database is not empty, they are not SQLite's header string, as an
 *   encrypted database's salt is not, and SQLite would roll the journal back,
 *   as above, recording a {@link SahPoolEncryptionUnsupportedError}, or when a
 *   read throws, recording what it threw. A journal of a database that had no
 *   pages journals no page, and rolling it back only empties the database, as
 *   for a new database whose first transaction spilled the pages after page 1,
 *   which leaves zeros in place of the header string. A torn write can leave
 *   zeros in place of the salt, so zeros pass only for an empty database: an
 *   encrypted database whose salt is zeros keeps its journal, which its key
 *   rolls back from the journal's page-1 record, as above, and a plaintext one
 *   whose header string is zeros fails such a connection too, rather than risk
 *   the other's journal. SQLite counts a journal it cannot open as hot, and its
 *   rollback then cannot open it either, so the statement fails with
 *   SQLITE_CANTOPEN and the journal stays for the key. A leftover journal that
 *   is not hot opens: `journal_mode = PERSIST` zeroes its header and TRUNCATE
 *   leaves it empty, and a crash before SQLite first syncs a journal leaves
 *   zeros in place of its magic, except with `synchronous = OFF`, which writes
 *   the magic with the header. Such a connection then fails with SQLite's
 *   SQLITE_NOTADB when it reads page 1, as it does without a journal. A journal
 *   that a transaction creates holds nothing to roll back, so opening it reads
 *   nothing of the database.
 * - Once a page 1, of the database or of a record, has authenticated, which
 *   proves the key, a record's page that fails to authenticate is zero-filled,
 *   records nothing, and fails the read with SQLITE_IOERR_SHORT_READ, which
 *   SQLite's rollback takes as the end of the journal, as it takes a record
 *   whose checksum differs. With `synchronous = OFF`, SQLite plays a journal
 *   back to its end and relies on the checksums to stop. A journal that
 *   `journal_mode = PERSIST` or `locking_mode = EXCLUSIVE` keeps still holds
 *   the previous transaction's records, so a crash right after a record's page
 *   number leaves it before a stale page encrypted as another page. SQLite3
 *   Multiple Ciphers fails such a rollback with SQLITE_CORRUPT. The
 *   opfs-sahpool of 2.2.4 never ran one, because it never rolled a journal
 *   back.
 * - A journal header is stored as it is, also one as long as a page that follows
 *   a checksum, which SQLite3 Multiple Ciphers encrypts as a page. Headers are
 *   4096 bytes, the sector size, at most, so that happens only with pages of
 *   4096 bytes or fewer, never Evolu's 8192, and SQLite then reads such a
 *   header as the end of the journal, with either.
 * - SQLite opens no `-wal` file and no temporary file through the pool: the build
 *   omits WAL and keeps temporary files, such as statement journals, sorts and
 *   temporary tables, in memory, also with `PRAGMA temp_store = FILE`.
 * - A super-journal holds only file names. An attached database and the output of
 *   `VACUUM INTO` are main databases of their own, encrypted only when a key is
 *   registered for their path while they open. SQLite reserves no bytes in a
 *   file that `ATTACH` creates, so with a key registered its first write fails,
 *   as above; `VACUUM INTO` reserves the bytes the main database does.
 *
 * ### Primitives
 *
 * - AES-CBC and SHA-512 are the stubs of `@awasm/noble/stub.js`, and HMAC and
 *   PBKDF2 come from its `hmac.js` and `kdf.js` over the SHA-512 stub. Opening
 *   a pool installs `@awasm/noble`'s wasm backend into each stub that has none,
 *   so an app can install another backend before or after, such as
 *   `@awasm/noble/noble.js`, which wraps the audited `@noble/ciphers` and
 *   `@noble/hashes`.
 * - `@awasm/noble` zeroes its wasm memory after each operation, and the pool
 *   zeroes the buffers that held a decrypted page outside SQLite's memory.
 *
 * ## The VFS
 *
 * - It is named `opfs-sahpool:` followed by the names of the directory joined
 *   with `/`, so `[".evolu"]` gets `opfs-sahpool:.evolu` and `["a", "b"]` gets
 *   `opfs-sahpool:a/b`, which no other names get, because no {@link OpfsName}
 *   contains `/`, NUL, where SQLite ends the name, or a lone surrogate, which
 *   UTF-8 cannot encode. It is registered once per VFS name and wasm instance.
 *   It is allocated and registered through `SqliteWasm.call`, so on a broken
 *   instance opening a new directory throws before anything is allocated, and
 *   an exception that escapes the registration breaks the instance.
 * - The VFS struct is version 2 with `xCurrentTimeInt64`, and the I/O methods are
 *   version 1 without the shared memory only WAL uses.
 * - Every slot of both structs up to their declared version is a real function,
 *   except the `xDl*` slots: the build omits loadable extensions, so SQLite
 *   never calls them. SQLite tolerates a NULL `xDelete`, `xSectorSize` or
 *   `xGetLastError`, and never calls `xCurrentTime` when `xCurrentTimeInt64` is
 *   set, but VFS shims such as SQLite's cksumvfs forward every slot without
 *   NULL checks. `xGetLastError` reports no system error, writing nothing, so
 *   it accepts nBuf 0 and a NULL buffer.
 * - `xFileControl` returns SQLITE_NOTFOUND for every opcode, as in opfs-sahpool,
 *   so SQLite handles every pragma itself, except a `PRAGMA secure_delete` that
 *   an encrypted database refuses, as above.
 * - `xDeviceCharacteristics` returns 0, and `xSectorSize` returns 4096.
 *   opfs-sahpool returns SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN, which makes SQLite
 *   keep a PERSIST or TRUNCATE journal open after it unlocks. A connection in
 *   DELETE mode could then delete the journal, freeing its slot, and a crash
 *   would leave a transaction half-applied. With 0, SQLite closes the journal
 *   when it unlocks, as with unix, and only a connection holding RESERVED
 *   deletes a journal.
 * - The VFS struct, the I/O methods struct and the name are allocated once and
 *   never freed.
 *
 * ## Pausing
 *
 * Disposing a {@link SahPool} pauses it: every handle closes, so another worker
 * can take the files over. The VFS stays registered for the lifetime of the
 * wasm instance. While no pool holds its files, `xOpen` fails with
 * SQLITE_CANTOPEN, `xAccess` finds no file, and `xDelete` returns
 * SQLITE_IOERR_DELETE. Opening the same directory again unpauses it.
 *
 * @module
 */

import {
  assert,
  brand,
  disposable,
  durationToMillis,
  eqUint8Array,
  err,
  isNonEmptyArray,
  mapArray,
  ok,
  performanceDurationBetween,
  safelyStringifyUnknownValue,
  sleep,
  String,
  tryAsync,
  trySync,
  zipArray,
  type NonEmptyReadonlyArray,
  type NonNegativeInt,
  type PositiveDuration,
  type PositiveMillis,
  type Random,
  type RandomBytes,
  type RandomBytesDep,
  type ReportDefectDep,
  type Result,
  type Task,
  type TimeDep,
  type Typed,
  type TypeError,
} from "@evolu/common";
import { cbc as wasmCbc, sha512 as wasmSha512 } from "@awasm/noble";
import { hmac } from "@awasm/noble/hmac.js";
import { pbkdf2 } from "@awasm/noble/kdf.js";
import { cbc, sha512 } from "@awasm/noble/stub.js";
import {
  SQLITE_BUSY,
  SQLITE_CANTOPEN,
  SQLITE_CORRUPT,
  SQLITE_ERROR,
  SQLITE_FCNTL_PRAGMA,
  SQLITE_FULL,
  SQLITE_IOERR_DELETE,
  SQLITE_IOERR_DIR_FSYNC,
  SQLITE_IOERR_FSTAT,
  SQLITE_IOERR_FSYNC,
  SQLITE_IOERR_READ,
  SQLITE_IOERR_SHORT_READ,
  SQLITE_IOERR_TRUNCATE,
  SQLITE_IOERR_WRITE,
  SQLITE_LOCK_EXCLUSIVE,
  SQLITE_LOCK_NONE,
  SQLITE_LOCK_PENDING,
  SQLITE_LOCK_RESERVED,
  SQLITE_LOCK_SHARED,
  SQLITE_NOMEM,
  SQLITE_NOTADB,
  SQLITE_NOTFOUND,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_DELETEONCLOSE,
  SQLITE_OPEN_EXCLUSIVE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_MAIN_JOURNAL,
  SQLITE_OPEN_MEMORY,
  SQLITE_OPEN_SUPER_JOURNAL,
  SQLITE_OPEN_WAL,
  sqlite3_file_layout,
  sqlite3_io_methods_layout,
  sqlite3_vfs_layout,
  type SqliteLockLevel,
  type SqliteResultCode,
} from "./Constants.ts";
import type {
  SqliteEncryptingVfs,
  SqlitePageAuthenticationError,
  SqliteShortWriteError,
  SqliteVfsFailure,
  SqliteVfsIoError,
  SqliteVfsMethod,
  SqliteVfsPath,
  deriveLegacySqliteKey,
} from "./Database.ts";
import {
  allocCString,
  allocWasm,
  readCString,
  type SqliteNoMemError,
} from "./Memory.ts";
import type {
  CStringPtr,
  SqliteFilePtr,
  SqliteVfsPtr,
  WasmPtr,
} from "./Pointer.ts";
import {
  installWasmFunctions,
  type SqliteWasmDep,
  type SqliteWasmFunction,
  type SqliteWasmInitializeError,
} from "./Wasm.ts";

/**
 * A pool of sync access handles, and the VFS SQLite opens its files with, on
 * which File and EncryptedFile databases open.
 */
export interface SahPool extends SqliteEncryptingVfs, Disposable {
  /**
   * Reads bytes of a file without SQLite, such as the first 16 bytes of an
   * encrypted database, which are its cipher salt. The path is one
   * {@link SahPool.getPaths} returns, and the offset counts from the start of
   * the file's data, after the header. Fewer bytes come back at the end of the
   * file.
   */
  readonly read: (
    path: string,
    offset: NonNegativeInt,
    byteLength: NonNegativeInt,
  ) => Result<
    Uint8Array<ArrayBuffer>,
    SahPoolFileNotFoundError | SqliteVfsIoError
  >;
}

/** Options for {@link openSahPool}. */
export interface SahPoolOptions {
  /**
   * The pool directory, as the {@link OpfsName}s of the directories from the
   * OPFS root to it, such as `[".evolu"]`. Missing directories are created. The
   * names joined with `/` name the VFS, such as `opfs-sahpool:.evolu`, which no
   * other names get.
   *
   * As in opfs-sahpool, one pool may use a directory at a time, across workers
   * and wasm instances, so serialize opens of a directory, as Evolu does with
   * its leader Web Lock. Otherwise, two openers of a new or empty directory can
   * each create their own slots, and a file both create then exists twice: on
   * the next open only one version shows, and the other is kept hidden and
   * never reused.
   */
  readonly directory: NonEmptyReadonlyArray<OpfsName>;

  /**
   * How long to keep trying to open the pool while another context holds a slot
   * of it. The pool is opened again 50 ms after a held attempt, then after
   * twice the previous delay, up to a second, and the open fails with
   * {@link SahPoolHeldError} once an attempt ends at least this long after the
   * first one started. Without it, a held slot fails the open at once.
   */
  readonly heldTimeout?: PositiveDuration;
}

/**
 * Opens the pool in a directory, registering its VFS on first use.
 *
 * Dispose every database on the pool before the pool; disposing a pool with an
 * open file throws, because closing a handle under SQLite would corrupt its
 * state.
 */
export const openSahPool =
  ({
    directory,
    heldTimeout,
  }: SahPoolOptions): Task<
    SahPool,
    SahPoolError,
    OpfsRootDep & SqliteWasmDep
  > =>
  async (run) => {
    const { opfsRoot, random, randomBytes, sqliteWasm, time } = run.deps;
    // An app may have installed another backend, before or after.
    cbc.install(wasmCbc, { onlyMissing: true });
    sha512.install(wasmSha512, { onlyMissing: true });
    // No OpfsName contains "/", NUL or a lone surrogate, so no other names get
    // this name, also as the UTF-8 C string SQLite reads up to its NUL.
    const vfsName = `opfs-sahpool:${directory.join("/")}`;
    const claimed =
      claimedVfsNamesByTable.get(sqliteWasm.functionTable) ?? new Set<string>();
    claimedVfsNamesByTable.set(sqliteWasm.functionTable, claimed);

    // Claimed before the first await, so a second open in this instance fails
    // as already open rather than on the slots this instance holds or by
    // creating slots of its own in a new directory, and never replaces the
    // first's methods on the shared registration.
    if (claimed.has(vfsName))
      return err({ type: "SahPoolAlreadyOpenError", directory });
    claimed.add(vfsName);
    using disposer = new DisposableStack();
    disposer.defer(() => {
      claimed.delete(vfsName);
    });

    const toSetupError = (cause: unknown): SahPoolSetupError => ({
      type: "SahPoolSetupError",
      cause,
    });

    const waitStart = time.performance.now();
    const slots: Array<Slot> = [];
    disposer.defer(() => {
      for (const slot of slots) slot.handle.close();
    });
    let opaque: OpfsDirectoryHandle;
    for (let retryDelay = 50; ; retryDelay = Math.min(retryDelay * 2, 1000)) {
      const listed = await tryAsync(async () => {
        let handle = await opfsRoot.getDirectory();
        for (const name of directory)
          handle = await handle.getDirectoryHandle(name, { create: true });
        handle = await handle.getDirectoryHandle(sahPoolOpaqueDirectoryName, {
          create: true,
        });
        const files: Array<OpfsFileHandle> = [];
        for await (const entry of handle.values())
          if (entry.kind === "file") files.push(entry);
        return { opaque: handle, files };
      }, toSetupError);
      if (!listed.ok) return listed;
      const { files } = listed.value;

      // Every acquisition settles before setup gives up, so none that resolves
      // after a rejection is left open. An async function turns a synchronous
      // throw into a rejection: a SharedWorker of Chromium or Firefox has no
      // createSyncAccessHandle, so calling it throws a TypeError.
      const acquired = await Promise.allSettled(
        files.map(async (file) => file.createSyncAccessHandle()),
      );
      const rejected: Array<{
        readonly fileName: string;
        readonly cause: unknown;
      }> = [];
      for (const [file, result] of zipArray([files, acquired]))
        if (result.status === "fulfilled")
          slots.push({ fileName: file.name, handle: result.value });
        else rejected.push({ fileName: file.name, cause: result.reason });
      if (!isNonEmptyArray(rejected)) {
        opaque = listed.value.opaque;
        break;
      }

      // A held slot decides, so the error does not depend on the order OPFS
      // lists the slots in.
      const held = rejected.find(({ cause }) => isHeldError(cause));
      if (held == null) return err(toSetupError(rejected[0].cause));

      // A worker that ended without closing its database, because its tab
      // closed, crashed or navigated away, can still hold the pool's files
      // after a Web Lock that serializes workers has passed on: WebKit
      // releases a terminated worker's locks and its files separately, in no
      // set order (https://bugs.webkit.org/show_bug.cgi?id=301520), and
      // Chromium lets a terminated worker finish its task, holding them, for up
      // to two seconds. Such a worker can only release them, so the pool is
      // opened again until they are. A browser can also keep them until it
      // restarts, as Chromium does after site data is cleared on Windows, so
      // the wait has a bound.
      if (
        heldTimeout == null ||
        performanceDurationBetween(waitStart, time.performance.now()) >=
          durationToMillis(heldTimeout)
      )
        return err({ type: "SahPoolHeldError", ...held });
      for (const slot of slots.splice(0)) slot.handle.close();
      await run.ok(sleep(retryDelay as PositiveMillis));
    }

    const slotByPath = new Map<string, Slot>();
    // Slots to flush before the pool writes another header: those free when it
    // opened, those a delete freed whose flush failed, and those xOpen could
    // not flush.
    const unflushedSlots = new Set<Slot>();
    // The paths of slots that a slot listed after them maps. As in
    // opfs-sahpool, they stay unused, so no other file truncates or reuses
    // them, but deleting their path frees them too.
    const shadowedPathBySlot = new Map<Slot, string>();
    // Classifies the slots and tops them up. A failed write is returned, and
    // anything thrown is caught.
    const prepared = await tryAsync(
      async (): Promise<Result<void, unknown>> => {
        // As opfs-sahpool's getAssociatedPath, but each header is read into a
        // zeroed buffer, so a short slot is not parsed with the previous one's.
        for (const slot of slots) {
          const header = new Uint8Array(sahPoolHeaderDigestOffset + 8);
          slot.handle.read(header, { at: 0 });
          const flags = new DataView(header.buffer).getUint32(
            sahPoolHeaderFlagsOffset,
          );
          const digest = computeSahPoolDigest(
            header.subarray(0, sahPoolHeaderCorpusSize),
            flags,
          );
          const stored = new Uint32Array(
            header.buffer,
            sahPoolHeaderDigestOffset,
            2,
          );
          const pathLength = header.indexOf(0);
          if (
            (pathLength !== 0 &&
              ((flags & SQLITE_OPEN_DELETEONCLOSE) !== 0 ||
                (flags & sahPoolPersistentFileTypes) === 0)) ||
            stored[0] !== digest[0] ||
            stored[1] !== digest[1]
          ) {
            const freed = writeHeader(slot.handle, "", 0);
            if (!freed.ok) return freed;
            slot.handle.flush();
            slot.handle.truncate(sahPoolHeaderSize);
          } else if (pathLength === 0) {
            slot.handle.truncate(sahPoolHeaderSize);
            unflushedSlots.add(slot);
          } else {
            const path = utf8Decoder.decode(header.subarray(0, pathLength));
            const shadowed = slotByPath.get(path);
            if (shadowed != null) shadowedPathBySlot.set(shadowed, path);
            slotByPath.set(path, slot);
          }
        }

        while (slots.length < sahPoolDefaultCapacity) {
          const fileName = createRandomName(random);
          const file = await opaque.getFileHandle(fileName, { create: true });
          const handle = await file.createSyncAccessHandle();
          slots.push({ fileName, handle });
          handle.truncate(sahPoolHeaderSize);
        }
        return ok();
      },
      err,
    );
    const failed = prepared.ok ? prepared.value : prepared.error;
    if (!failed.ok) return err(toSetupError(failed.error));

    const openFiles = new Map<SqliteFilePtr, OpenFile>();
    const lockByPath = new Map<string, PathLock>();
    // The registered keys, copies the registrations zero when disposed.
    const keyByPath = new Map<string, Uint8Array<ArrayBuffer>>();
    // The first failure since the last clear.
    let failure: SqliteVfsFailure | null = null;
    const getOpenFile = (pFile: SqliteFilePtr): OpenFile => {
      const file = openFiles.get(pFile);
      assert(file != null, "The file is not open.");
      return file;
    };

    const recordFailure = (
      method: SqliteVfsMethod,
      path: string | null,
      error: unknown,
    ): void => {
      failure ??= { method, path, error };
    };

    // Runs a file's handle operation, which returns a result code, and records
    // what it throws, returning the method's own code.
    const runIo = (
      method: SqliteVfsMethod,
      file: OpenFile,
      code: SqliteResultCode,
      operation: (handle: OpfsSyncAccessHandle) => SqliteResultCode,
    ): SqliteResultCode => {
      try {
        return operation(file.slot.handle);
      } catch (error) {
        recordFailure(method, file.path, error);
        return code;
      }
    };

    const registrations =
      registrationsByTable.get(sqliteWasm.functionTable) ??
      new Map<string, SahPoolRegistration>();
    registrationsByTable.set(sqliteWasm.functionTable, registrations);
    let registration = registrations.get(vfsName);
    if (registration == null) {
      const registered = registerSahPoolVfs(run.deps, vfsName);
      if (!registered.ok) return err(toSetupError(registered.error));
      registration = registered.value;
      registrations.set(vfsName, registration);
    }
    const { ioMethods } = registration;

    // Flushes the unflushed slots, returning the first failure, so no header
    // written after a delete reaches the disk before the delete does, as the
    // first sync of a new journal in unix syncs its directory.
    const flushUnflushed = (): Result<void, unknown> => {
      for (const unflushed of unflushedSlots) {
        const flushed = trySync(
          () => unflushed.handle.flush(),
          (error) => error,
        );
        if (!flushed.ok) return flushed;
        unflushedSlots.delete(unflushed);
      }
      return ok();
    };

    // Writes and flushes the free header, which is the durable delete, and only
    // then forgets the path and truncates the slot. Returns false for a path
    // the pool does not have. It fails, keeping the path mapped, only before a
    // header write changed a byte of the path's slot: when the write changed
    // none, or when an earlier free header still cannot be flushed. Once a byte
    // changed, the header names no path on disk, and failing would make SQLite
    // roll back in this session from a journal that a worker dying during the
    // rollback loses, leaving the transaction half undone with integrity_check
    // ok. Restoring the header instead would need another write and flush on
    // the handle that just failed, so a failed flush leaves the slot to flush
    // before any later header.
    const deletePath = (path: string): Result<boolean, unknown> => {
      const slot = slotByPath.get(path);
      if (slot == null) return ok(false);
      // The slots it shadows too, or the next open would map the path to one
      // of them again, and first, so a failure leaves the path mapped.
      const slotsToFree = [...shadowedPathBySlot]
        .filter(([, shadowedPath]) => shadowedPath === path)
        .map(([shadowed]) => shadowed);
      slotsToFree.push(slot);
      for (const freeing of slotsToFree) {
        const ordered = flushUnflushed();
        if (!ordered.ok) return ordered;
        const written = writeHeader(freeing.handle, "", 0);
        // A count above the requested one is no count: Chromium off the record
        // returns FILE_ERROR_NO_SPACE, -8, for a write it refused before
        // copying a byte.
        const changed =
          written.ok ||
          (isShortWrite(written.error) &&
            written.error.written > 0 &&
            written.error.written < written.error.requested);
        if (!changed) return written;
        const flushed = trySync(
          () => freeing.handle.flush(),
          (error) => error,
        );
        if (!flushed.ok) unflushedSlots.add(freeing);
        shadowedPathBySlot.delete(freeing);
        // A failed truncate leaves the slot longer than the header, and the
        // xOpen that takes it next truncates it first, so a committed
        // transaction is not reported as an error.
        trySync(
          () => freeing.handle.truncate(sahPoolHeaderSize),
          (error) => error,
        );
      }
      slotByPath.delete(path);
      return ok(true);
    };

    // Lowers a file's lock to SHARED or NONE, as posixUnlock in os_unix.c does.
    const unlockFile = (pFile: SqliteFilePtr, level: SqliteLockLevel): void => {
      const file = getOpenFile(pFile);
      // The file's own level guards the path's lock.
      if (file.lock <= level) return;
      const pathLock = lockByPath.get(file.path);
      assert(pathLock != null, "The path is not locked.");
      const shared =
        level === SQLITE_LOCK_NONE ? pathLock.shared - 1 : pathLock.shared;
      if (shared === 0) lockByPath.delete(file.path);
      else
        lockByPath.set(file.path, {
          level:
            file.lock > SQLITE_LOCK_SHARED
              ? SQLITE_LOCK_SHARED
              : pathLock.level,
          shared,
        });
      openFiles.set(pFile, { ...file, lock: level });
    };

    const toPath = (zName: CStringPtr): Result<string, unknown> =>
      nameToPath(readCString({ sqliteWasm })(zName));

    // The open database a journal belongs to, found as
    // sqlite3_filename_database finds it: SQLite puts a journal's name after
    // its database's name and URI parameters, and four NUL bytes before the
    // database's name.
    const findDatabaseFile = (zJournal: CStringPtr): OpenFile | undefined => {
      const heap = sqliteWasm.getHeapU8();
      let zName: number = zJournal;
      while (
        zName > 4 &&
        (heap[zName - 1] !== 0 ||
          heap[zName - 2] !== 0 ||
          heap[zName - 3] !== 0 ||
          heap[zName - 4] !== 0)
      )
        zName--;
      return [...openFiles.values()].find((file) => file.zName === zName);
    };

    const methods: SahPoolMethods = {
      xOpen: (
        _vfs: SqliteVfsPtr,
        zName: CStringPtr | 0,
        pFile: SqliteFilePtr,
        flags: number,
        pOutFlags: WasmPtr | 0,
      ) => {
        // SQLite opens a file without a name only for a temporary file, which
        // this build keeps in memory. Without a name, every such file would
        // share one path.
        if (zName === 0) return SQLITE_CANTOPEN;
        const name = readCString({ sqliteWasm })(zName);
        const named = nameToPath(name);
        if (!named.ok) {
          recordFailure("xOpen", null, named.error);
          return SQLITE_CANTOPEN;
        }
        const path = named.value;
        const rejectTooLong = (): number => {
          recordFailure("xOpen", path, {
            type: "SahPoolInvalidPath",
            name,
          } satisfies SahPoolInvalidPathError);
          return SQLITE_CANTOPEN;
        };
        // Its journal's and super-journal's paths must fit a header too, or
        // every write, or every commit that writes an attached database, would
        // fail.
        if (
          (flags & SQLITE_OPEN_MAIN_DB) !== 0 &&
          utf8Encoder.encode(path).length > sahPoolMaxDatabasePathSize
        )
          return rejectTooLong();
        const database =
          (flags & SQLITE_OPEN_MAIN_JOURNAL) === 0
            ? undefined
            : findDatabaseFile(zName);
        // SQLite rolls a hot journal back before it reads the database's page
        // 1, whose salt authenticates the records, and a connection can have
        // no salt, or a stale one once the database was emptied and created
        // again. Without the key, SQLite would read the records as stored,
        // take the first, whose checksum then differs, as the end of the
        // journal, and delete it, leaving the transaction half-applied. A
        // journal SQLite cannot open counts as hot, and a rollback that cannot
        // open it fails, so the journal stays for the key. A journal the open
        // creates holds nothing to roll back, so a commit reads no more.
        const existingSlot = slotByPath.get(path);
        if (database != null && existingSlot != null) {
          const start = new Uint8Array(saltSize);
          const read = trySync(
            () => database.slot.handle.read(start, { at: sahPoolHeaderSize }),
            (error) => error,
          );
          if (!read.ok) {
            recordFailure("xOpen", path, read.error);
            return SQLITE_CANTOPEN;
          }
          const codec = database.cipher?.codec;
          // Without the key, the first bytes matter only when they are not
          // SQLite's header string, as an encrypted database's salt, which a
          // torn write can leave as zeros, is not.
          if (
            read.value !== 0 &&
            (codec != null || !eqUint8Array(start, sqliteHeaderString))
          ) {
            // Whether SQLite would roll the journal back and no page 1 that
            // authenticates gave the salt. SQLite rolls back only a journal
            // whose first byte is not 0, as the magic is not, which it writes
            // when it first syncs the journal, or with the header when
            // synchronous = OFF. The journal's first header stores the
            // database's original size in pages at byte 16, 0 when it had none:
            // such a journal journals no page, and rolling it back only empties
            // the database, whose first bytes are then a hole a spill left
            // before page 1 was written. Any page 1 that authenticates stores
            // the salt, even when another connection created the database again
            // since a page 1 proved this codec's key.
            const unsalted = trySync(
              () => {
                const journalStart = new Uint8Array(20);
                existingSlot.handle.read(journalStart, {
                  at: sahPoolHeaderSize,
                });
                if (
                  journalStart[0] === 0 ||
                  journalStart.subarray(16).every((byte) => byte === 0)
                )
                  return false;
                if (codec == null) return true;
                if (authenticateJournalPage1(existingSlot.handle, codec))
                  return false;
                // The database's page 1 at the page size it stores. One that
                // ends early ends with zeros, which fail to authenticate.
                const { handle } = database.slot;
                const header = new Uint8Array(18);
                handle.read(header, { at: sahPoolHeaderSize });
                const pageSize = storedPageSize(header);
                if (!isPageSize(pageSize)) return true;
                const page = new Uint8Array(pageSize);
                handle.read(page, { at: sahPoolHeaderSize });
                const authenticated = codec.decryptPage(1, page);
                page.fill(0);
                return !authenticated;
              },
              (error) => error,
            );
            if (!unsalted.ok) {
              recordFailure("xOpen", path, unsalted.error);
              return SQLITE_CANTOPEN;
            }
            if (unsalted.value) {
              if (codec == null) {
                recordFailure("xOpen", path, encryptionUnsupported);
                return SQLITE_CANTOPEN;
              }
              // A database keeps its salt while it has pages, so a tear must
              // not replace a proven one.
              if (!codec.isKeyProven()) codec.useSalt(start);
            }
          }
        }
        let slot = existingSlot;
        // SQLite creates a super-journal with SQLITE_OPEN_EXCLUSIVE, which
        // must not open a file that exists, as unix opens it with O_EXCL.
        if (
          slot != null &&
          (flags & (SQLITE_OPEN_CREATE | SQLITE_OPEN_EXCLUSIVE)) ===
            (SQLITE_OPEN_CREATE | SQLITE_OPEN_EXCLUSIVE)
        )
          return SQLITE_CANTOPEN;
        if (slot == null && (flags & SQLITE_OPEN_CREATE) !== 0) {
          if (!fitsHeader(path)) return rejectTooLong();
          const used = new Set([
            ...slotByPath.values(),
            ...shadowedPathBySlot.keys(),
          ]);
          slot = slots.find((free) => !used.has(free));
          if (slot == null) {
            recordFailure("xOpen", path, {
              type: "SahPoolFull",
              capacity: slots.length,
            } satisfies SahPoolFullError);
            return SQLITE_CANTOPEN;
          }
          const { handle } = slot;
          // An earlier delete could not shrink it.
          const truncated = trySync(
            () => {
              if (handle.getSize() > sahPoolHeaderSize)
                handle.truncate(sahPoolHeaderSize);
            },
            (error) => error,
          );
          if (!truncated.ok) {
            recordFailure("xOpen", path, truncated.error);
            return isStorageFull(truncated.error)
              ? SQLITE_FULL
              : SQLITE_CANTOPEN;
          }
          // A delete, setup or another pool may have left this slot's truncate
          // unflushed; a power loss could otherwise keep the new header with
          // the previous file's bytes behind it. Every unflushed delete too, so
          // this file cannot reach the disk before it.
          unflushedSlots.add(slot);
          const flushed = flushUnflushed();
          if (!flushed.ok) {
            recordFailure("xOpen", path, flushed.error);
            return SQLITE_IOERR_FSYNC;
          }
          const written = writeHeader(
            slot.handle,
            path,
            flags | sahPoolDigestV2Flag,
          );
          if (!written.ok) {
            recordFailure("xOpen", path, written.error);
            return isStorageFull(written.error) ? SQLITE_FULL : SQLITE_CANTOPEN;
          }
          slotByPath.set(path, slot);
        }
        if (slot == null) return SQLITE_CANTOPEN;
        const key =
          (flags & SQLITE_OPEN_MAIN_DB) === 0 ? undefined : keyByPath.get(path);
        const cipher: FileCipher | null =
          key != null
            ? {
                type: "Database",
                codec: createSahPoolCodec({ key: key.slice(), randomBytes }),
              }
            : database?.cipher?.type === "Database"
              ? {
                  type: "Journal",
                  codec: database.cipher.codec,
                  records: createJournalRecords(),
                }
              : null;
        openFiles.set(pFile, {
          path,
          slot,
          lock: SQLITE_LOCK_NONE,
          zName,
          cipher,
        });
        const view = sqliteWasm.getHeapDataView();
        view.setInt32(
          pFile + sqlite3_file_layout.members.pMethods.offset,
          ioMethods,
          true,
        );
        if (pOutFlags !== 0) view.setInt32(pOutFlags, flags, true);
        return SQLITE_OK;
      },
      xDelete: (_vfs: SqliteVfsPtr, zName: CStringPtr, syncDir: number) => {
        const path = toPath(zName);
        if (!path.ok) {
          recordFailure("xDelete", null, path.error);
          return SQLITE_IOERR_DELETE;
        }
        const deleted = deletePath(path.value);
        if (!deleted.ok) {
          recordFailure("xDelete", path.value, deleted.error);
          return SQLITE_IOERR_DELETE;
        }
        if (syncDir === 0) return SQLITE_OK;
        // A durable delete, as unixDelete syncs the directory after the
        // unlink and fails when that does.
        const synced = flushUnflushed();
        if (synced.ok) return SQLITE_OK;
        recordFailure("xDelete", path.value, synced.error);
        return SQLITE_IOERR_DIR_FSYNC;
      },
      xAccess: (
        _vfs: SqliteVfsPtr,
        zName: CStringPtr,
        _flags: number,
        pResOut: WasmPtr,
      ) => {
        const path = toPath(zName);
        sqliteWasm
          .getHeapDataView()
          .setInt32(
            pResOut,
            path.ok && slotByPath.has(path.value) ? 1 : 0,
            true,
          );
        return SQLITE_OK;
      },
      xClose: (pFile: SqliteFilePtr) => {
        const file = getOpenFile(pFile);
        unlockFile(pFile, SQLITE_LOCK_NONE);
        openFiles.delete(pFile);
        if (file.cipher?.type === "Database")
          file.cipher.codec[Symbol.dispose]();
        return SQLITE_OK;
      },
      xRead: (
        pFile: SqliteFilePtr,
        pBuf: WasmPtr,
        amount: number,
        offset: bigint,
      ) => {
        const file = getOpenFile(pFile);
        const { cipher, path } = file;
        return runIo("xRead", file, SQLITE_IOERR_READ, (handle) => {
          const buffer = sqliteWasm.getHeapU8().subarray(pBuf, pBuf + amount);
          const at = Number(offset);
          const read = handle.read(buffer, { at: sahPoolHeaderSize + at });
          // SQLite requires the rest to be zeros.
          buffer.fill(0, read);
          const shortRead =
            read === amount ? SQLITE_OK : SQLITE_IOERR_SHORT_READ;
          if (cipher == null) return shortRead;
          const pageNumber =
            cipher.type === "Database"
              ? toPageNumber(at, amount)
              : cipher.records.track(at, buffer);
          if (pageNumber != null) {
            // A connection that opened the file while it was empty keeps
            // SQLite's default page size, so it reads page 1 whole at that
            // size, learns the size page 1 stores, and reads it again. Page 1
            // is decrypted at the size it stores, and the read gets its first
            // bytes, with zeros past it.
            const storedSize = storedPageSize(buffer);
            const pageSize =
              cipher.type === "Database" &&
              pageNumber === 1 &&
              isPageSize(storedSize)
                ? storedSize
                : amount;
            const page =
              pageSize === amount ? buffer : new Uint8Array(pageSize);
            const pageRead =
              page === buffer
                ? read
                : handle.read(page, { at: sahPoolHeaderSize });
            // No ciphertext reaches SQLite as data. A short read ends a
            // journal, and one that reads nothing is past the end, as page 1
            // of an empty file is. SQLite reads a database's page only within
            // the file, so one that ends early was cut off or torn, and fails
            // as a page that does not authenticate, or zeros would pass as its
            // data.
            const complete = pageRead === pageSize;
            if (!complete && (cipher.type === "Journal" || pageRead === 0)) {
              buffer.fill(0);
              return SQLITE_IOERR_SHORT_READ;
            }
            if (complete && cipher.codec.decryptPage(pageNumber, page)) {
              if (page === buffer) return SQLITE_OK;
              buffer.fill(0);
              buffer.set(page.subarray(0, amount));
              page.fill(0);
              return shortRead;
            }
            buffer.fill(0);
            // With the key proven, a record's page that fails to authenticate
            // ends the journal, as a checksum that differs ends it in SQLite,
            // whose rollback takes a short read as the end. A crash with
            // synchronous = OFF can leave a stale page after a new page number.
            if (cipher.type === "Journal" && cipher.codec.isKeyProven())
              return SQLITE_IOERR_SHORT_READ;
            recordFailure("xRead", path, {
              type: "SqlitePageAuthenticationError",
              pageNumber,
            } satisfies SqlitePageAuthenticationError);
            return pageNumber === 1 ? SQLITE_NOTADB : SQLITE_CORRUPT;
          }
          if (cipher.type === "Journal") return shortRead;
          // Part of page 1: decrypted when it authenticates, as stored
          // otherwise. Its first bytes up to the end of the page size.
          const header = new Uint8Array(18);
          if (handle.read(header, { at: sahPoolHeaderSize }) !== header.length)
            return shortRead;
          const pageSize = storedPageSize(header);
          if (!isPageSize(pageSize)) return shortRead;
          if (at + amount > pageSize) {
            buffer.fill(0);
            recordFailure("xRead", path, encryptionUnsupported);
            return SQLITE_IOERR_READ;
          }
          const page = new Uint8Array(pageSize);
          if (
            handle.read(page, { at: sahPoolHeaderSize }) === pageSize &&
            cipher.codec.decryptPage(1, page)
          )
            buffer.set(page.subarray(at, at + amount));
          page.fill(0);
          return shortRead;
        });
      },
      xWrite: (
        pFile: SqliteFilePtr,
        pBuf: WasmPtr,
        amount: number,
        offset: bigint,
      ) => {
        const file = getOpenFile(pFile);
        const at = Number(offset);
        const bytes = sqliteWasm.getHeapU8().subarray(pBuf, pBuf + amount);
        const { cipher } = file;
        // What to store, or null for what the pool cannot keep encrypted.
        const sealed = trySync(
          (): Uint8Array<ArrayBuffer> | null => {
            if (cipher == null) return bytes;
            const pageNumber =
              cipher.type === "Database"
                ? toPageNumber(at, amount)
                : cipher.records.track(at, bytes);
            if (pageNumber != null)
              return cipher.codec.encryptPage(pageNumber, bytes);
            // A journal's headers, page numbers and checksums.
            return cipher.type === "Journal" ? bytes : null;
          },
          (error) => error,
        );
        if (!sealed.ok || sealed.value == null) {
          recordFailure(
            "xWrite",
            file.path,
            sealed.ok ? encryptionUnsupported : sealed.error,
          );
          return SQLITE_IOERR_WRITE;
        }
        const written = writeBytes(
          file.slot.handle,
          sealed.value,
          sahPoolHeaderSize + at,
        );
        if (written.ok) return SQLITE_OK;
        recordFailure("xWrite", file.path, written.error);
        return isStorageFull(written.error) ? SQLITE_FULL : SQLITE_IOERR_WRITE;
      },
      xTruncate: (pFile: SqliteFilePtr, size: bigint) => {
        const file = getOpenFile(pFile);
        // SQLite truncates a database that shrank right after deleting its
        // journal, so the delete must reach the disk first, as unix orders an
        // unlink before a later truncate.
        const ordered = flushUnflushed();
        if (!ordered.ok) {
          recordFailure("xTruncate", file.path, ordered.error);
          return SQLITE_IOERR_TRUNCATE;
        }
        return runIo("xTruncate", file, SQLITE_IOERR_TRUNCATE, (handle) => {
          handle.truncate(sahPoolHeaderSize + Number(size));
          return SQLITE_OK;
        });
      },
      xSync: (pFile: SqliteFilePtr) =>
        runIo("xSync", getOpenFile(pFile), SQLITE_IOERR_FSYNC, (handle) => {
          handle.flush();
          return SQLITE_OK;
        }),
      xFileSize: (pFile: SqliteFilePtr, pSize: WasmPtr) =>
        runIo("xFileSize", getOpenFile(pFile), SQLITE_IOERR_FSTAT, (handle) => {
          const size = handle.getSize() - sahPoolHeaderSize;
          sqliteWasm.getHeapDataView().setBigInt64(pSize, BigInt(size), true);
          return SQLITE_OK;
        }),
      xLock: (pFile: SqliteFilePtr, level: SqliteLockLevel) => {
        const file = getOpenFile(pFile);
        if (file.lock >= level) return SQLITE_OK;
        const pathLock = lockByPath.get(file.path) ?? {
          level: SQLITE_LOCK_NONE,
          shared: 0,
        };
        // Another connection's lock precludes it.
        if (
          file.lock !== pathLock.level &&
          (pathLock.level >= SQLITE_LOCK_PENDING || level > SQLITE_LOCK_SHARED)
        )
          return SQLITE_BUSY;
        if (level === SQLITE_LOCK_EXCLUSIVE && pathLock.shared > 1) {
          // A failed step from RESERVED leaves PENDING, which admits no new
          // SHARED lock, as unixLock does.
          if (file.lock === SQLITE_LOCK_RESERVED) {
            lockByPath.set(file.path, {
              ...pathLock,
              level: SQLITE_LOCK_PENDING,
            });
            openFiles.set(pFile, { ...file, lock: SQLITE_LOCK_PENDING });
          }
          return SQLITE_BUSY;
        }
        lockByPath.set(
          file.path,
          level === SQLITE_LOCK_SHARED
            ? {
                // Beside another SHARED or a RESERVED, the path keeps its level.
                level:
                  pathLock.level === SQLITE_LOCK_NONE ? level : pathLock.level,
                shared: pathLock.shared + 1,
              }
            : { ...pathLock, level },
        );
        openFiles.set(pFile, { ...file, lock: level });
        return SQLITE_OK;
      },
      xUnlock: (pFile: SqliteFilePtr, level: SqliteLockLevel) => {
        unlockFile(pFile, level);
        return SQLITE_OK;
      },
      xCheckReservedLock: (pFile: SqliteFilePtr, pResOut: WasmPtr) => {
        const pathLock = lockByPath.get(getOpenFile(pFile).path);
        sqliteWasm
          .getHeapDataView()
          .setInt32(
            pResOut,
            pathLock != null && pathLock.level > SQLITE_LOCK_SHARED ? 1 : 0,
            true,
          );
        return SQLITE_OK;
      },
      xFileControl: (pFile: SqliteFilePtr, op: number, pArg: WasmPtr) => {
        if (op !== SQLITE_FCNTL_PRAGMA) return SQLITE_NOTFOUND;
        const file = getOpenFile(pFile);
        if (file.cipher?.type !== "Database") return SQLITE_NOTFOUND;
        // The pragma's name and value, or NULL for a query, after the slot
        // for its result or error message.
        const view = sqliteWasm.getHeapDataView();
        const zValue = view.getUint32(pArg + 8, true) as CStringPtr | 0;
        if (
          readCString({ sqliteWasm })(
            view.getUint32(pArg + 4, true) as CStringPtr,
          ).toLowerCase() !== "secure_delete" ||
          zValue === 0 ||
          secureDeleteOnValues.has(
            readCString({ sqliteWasm })(zValue).toLowerCase(),
          )
        )
          return SQLITE_NOTFOUND;
        // SQLite frees the message.
        const message = allocCString({ sqliteWasm })(
          "Cannot turn secure_delete off for an encrypted database, because a freed page it does not write would fail to authenticate.",
        );
        if (!message.ok) return SQLITE_NOMEM;
        // A fresh view, because the allocation can grow memory, which detaches
        // the one taken before it.
        sqliteWasm.getHeapDataView().setUint32(pArg, message.value, true);
        recordFailure("xFileControl", file.path, encryptionUnsupported);
        return SQLITE_ERROR;
      },
    };
    registration.setMethods(methods);
    disposer.defer(() => {
      registration.setMethods(null);
    });

    const pool = disposable<SahPool>(
      {
        vfsName,
        registerKey: (path, key) => {
          assert(
            !keyByPath.has(path),
            `A key is already registered for ${path}.`,
          );
          const copy = key.slice();
          keyByPath.set(path, copy);
          using keyDisposer = new DisposableStack();
          keyDisposer.defer(() => {
            copy.fill(0);
            if (keyByPath.get(path) === copy) keyByPath.delete(path);
          });
          return disposable<Disposable>({}, keyDisposer);
        },
        getPaths: () => [...slotByPath.keys()],
        read: (path, offset, byteLength) => {
          const slot = slotByPath.get(path);
          if (slot == null) return err({ type: "SahPoolFileNotFound", path });
          const bytes = new Uint8Array(byteLength);
          const read = trySync(
            () => slot.handle.read(bytes, { at: sahPoolHeaderSize + offset }),
            (cause): SqliteVfsIoError => ({ type: "SqliteVfsIoError", cause }),
          );
          if (!read.ok) return read;
          // Fewer at the end of the file.
          return ok(
            read.value === byteLength ? bytes : bytes.slice(0, read.value),
          );
        },
        unlink: (path) => {
          // The database first, and its free header is flushed before the
          // journal's is written, so neither a failure nor a power loss leaves
          // it without the journal that would roll it back.
          const paths = [path, `${path}-journal`, `${path}-wal`];
          for (const file of openFiles.values())
            if (paths.includes(file.path))
              throw new Error(`Cannot unlink ${path}, which is open.`);
          let found = false;
          for (const [index, filePath] of paths.entries()) {
            const deleted = deletePath(filePath);
            if (!deleted.ok)
              return err({ type: "SqliteVfsIoError", cause: deleted.error });
            if (index === 0) found = deleted.value;
          }
          return ok(found);
        },
        getFailure: () => failure,
        clearFailure: () => {
          failure = null;
        },
      },
      disposer,
    );
    return ok({
      ...pool,
      [Symbol.dispose]: () => {
        // A Disposable that throws is still disposed, so this checks first.
        if (openFiles.size > 0)
          throw new Error(
            "Cannot dispose a SahPool with an open file, because closing its handle would corrupt SQLite's state.",
          );
        pool[Symbol.dispose]();
      },
    });
  };

/** Why {@link openSahPool} failed. */
export type SahPoolError =
  SahPoolAlreadyOpenError | SahPoolHeldError | SahPoolSetupError;

/**
 * This instance has a pool in the directory open, or is opening one. A retry
 * succeeds once that pool is disposed or its open failed.
 */
export interface SahPoolAlreadyOpenError extends Typed<"SahPoolAlreadyOpenError"> {
  /** The {@link SahPoolOptions.directory}. */
  readonly directory: NonEmptyReadonlyArray<OpfsName>;
}

/**
 * Another context or instance holds a slot of the pool. The pool wrote nothing,
 * and a retry succeeds once the slot is released.
 *
 * In WebKit, the error can also mean that the context opening the pool is
 * stopping, because WebKit reports that with the same `InvalidStateError` as a
 * held file, so retries need a bound.
 */
export interface SahPoolHeldError extends Typed<"SahPoolHeldError"> {
  /** The slot's file name in {@link sahPoolOpaqueDirectoryName}. */
  readonly fileName: string;
  /**
   * What `createSyncAccessHandle` threw: `NoModificationAllowedError`, or
   * `InvalidStateError` in WebKit.
   */
  readonly cause: unknown;
}

/**
 * OPFS failed while the pool was being set up, or its VFS could not be
 * registered.
 */
export interface SahPoolSetupError extends Typed<"SahPoolSetupError"> {
  /**
   * What OPFS threw, a {@link SqliteShortWriteError}, or a
   * {@link SqliteNoMemError} or {@link SqliteWasmInitializeError} from
   * registering the VFS.
   */
  readonly cause: unknown;
}

/** The pool has no file with the path. */
export interface SahPoolFileNotFoundError extends Typed<"SahPoolFileNotFound"> {
  readonly path: string;
}

/**
 * No slot of the pool is free for a new file, which `xOpen` records when it
 * fails with SQLITE_CANTOPEN.
 */
export interface SahPoolFullError extends Typed<"SahPoolFull"> {
  /** The number of slots, none of them free. */
  readonly capacity: number;
}

/**
 * A name `xOpen`, `xDelete` or `xAccess` cannot map to a pool path, because the
 * suffix SQLite appends would land in its query, fragment or host, which would
 * map a database and its journal to the same file. `xOpen` also records it for
 * a path that would not fit a slot's header, or a database's path whose
 * super-journal's path would not.
 */
export interface SahPoolInvalidPathError extends Typed<"SahPoolInvalidPath"> {
  readonly name: string;
}

/**
 * An access to an encrypted database the pool cannot keep encrypted: a read or
 * write that is not a whole page, other than a read within page 1, or a page 1
 * that reserves other than 80 bytes or stores another page size than its
 * length, as a VACUUM that would change the page size writes it. `xRead`
 * records it when it fails with SQLITE_IOERR_READ and `xWrite` with
 * SQLITE_IOERR_WRITE. `xOpen` records it when it fails with SQLITE_CANTOPEN to
 * open the journal of an encrypted database opened without its key, which would
 * read the journal as stored, and `xFileControl` when it refuses to turn
 * `secure_delete` off for an encrypted database, which would leave freed pages
 * that fail to authenticate.
 */
export interface SahPoolEncryptionUnsupportedError extends Typed<"SahPoolEncryptionUnsupported"> {}

/**
 * Access to the OPFS root, which `navigator.storage` provides in a dedicated
 * worker.
 *
 * It and the handle interfaces below declare only the part of the File System
 * API the pool uses, which the browser's objects implement, so a test can pass
 * a fake.
 */
export interface OpfsRoot {
  readonly getDirectory: () => Promise<OpfsDirectoryHandle>;
}

/** The part of `FileSystemDirectoryHandle` the pool uses. */
export interface OpfsDirectoryHandle {
  readonly kind: "directory";
  readonly getDirectoryHandle: (
    name: string,
    options: { readonly create: true },
  ) => Promise<OpfsDirectoryHandle>;
  readonly getFileHandle: (
    name: string,
    options: { readonly create: true },
  ) => Promise<OpfsFileHandle>;
  readonly values: () => AsyncIterable<OpfsDirectoryHandle | OpfsFileHandle>;
}

/** The part of `FileSystemFileHandle` the pool uses. */
export interface OpfsFileHandle {
  readonly kind: "file";
  readonly name: string;
  readonly createSyncAccessHandle: () => Promise<OpfsSyncAccessHandle>;
}

/** The part of `FileSystemSyncAccessHandle` the pool uses. */
export interface OpfsSyncAccessHandle {
  readonly read: (
    buffer: Uint8Array<ArrayBuffer>,
    options: { readonly at: number },
  ) => number;
  readonly write: (
    buffer: Uint8Array<ArrayBuffer>,
    options: { readonly at: number },
  ) => number;
  readonly truncate: (newSize: number) => void;
  readonly getSize: () => number;
  readonly flush: () => void;
  readonly close: () => void;
}

/** Dependency wrapper for {@link OpfsRoot}. */
export interface OpfsRootDep {
  readonly opfsRoot: OpfsRoot;
}

/** Error returned when a string is not a valid {@link OpfsName}. */
export interface OpfsNameError extends TypeError<"OpfsName"> {
  readonly value: string;
}

/**
 * The name of a file or directory in OPFS, a [valid file
 * name](https://fs.spec.whatwg.org/#valid-file-name) of the File System
 * Standard on every platform in one spelling: not empty, not `.` or `..`,
 * without `/` or `\`, which is a path separator on Windows, without NUL or a
 * lone surrogate, and in Unicode NFC.
 *
 * Names that differ only in case are different names, but in WebKit on macOS,
 * whose file system ignores case by default, they name one directory, and two
 * pools can hold it at once, because WebKit locks a file by its path as
 * spelled. Spell each directory in one case.
 */
export const OpfsName = /*#__PURE__*/ brand(
  "OpfsName",
  String,
  (value) =>
    value === "" ||
    value === "." ||
    value === ".." ||
    // SQLite reads a VFS name only up to its first NUL, and Chromium a file
    // name, and the File System API and TextEncoder replace a lone surrogate
    // with U+FFFD, so such a name would share a VFS or directory with another.
    /[/\\\0\p{Cs}]/u.test(value) ||
    // WebKit on macOS keeps OPFS as files of a file system that ignores
    // Unicode normalization, but locks a file by its path as spelled, so two
    // normalizations of a name would both hold one directory.
    value.normalize("NFC") !== value
      ? err<OpfsNameError>({ type: "OpfsName", value })
      : ok(),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a valid OpfsName.`,
);
export type OpfsName = typeof OpfsName.Output;

/** The size of a slot's header, where the file's data starts. */
export const sahPoolHeaderSize = 4096;

/** The bytes reserved for the NUL-padded path at the start of the header. */
export const sahPoolHeaderPathSize = 512;

/**
 * The longest path of a database a pool opens, in UTF-8 bytes, 498. SQLite
 * names the other files of a database by appending a suffix to its path, at
 * most the 12 bytes of a super-journal's `-mjXXXXXX9XX`, and each path must fit
 * a slot's header with its NUL, as opfs-sahpool requires, which allows 510
 * bytes.
 */
export const sahPoolMaxDatabasePathSize = sahPoolHeaderPathSize - 2 - 12;

/** Where the header's big-endian u32 flags start, after the path. */
export const sahPoolHeaderFlagsOffset = 512;

/** The size of the path and flags, which the digest covers. */
export const sahPoolHeaderCorpusSize = 516;

/** Where the header's digest, two platform-endian u32 values, starts. */
export const sahPoolHeaderDigestOffset = 516;

/**
 * The flag that marks a header digest as version 2.
 *
 * Opfs-sahpool before SQLite 3.50 computed every digest as `[0, 0]` because of
 * an overflow. The fix repurposed SQLITE_OPEN_MEMORY, which never reaches a
 * VFS, to mark headers written with the fixed digest, so older headers stay
 * valid.
 */
export const sahPoolDigestV2Flag = SQLITE_OPEN_MEMORY;

/**
 * The file types that persist across sessions: SQLITE_OPEN_MAIN_DB,
 * SQLITE_OPEN_MAIN_JOURNAL, SQLITE_OPEN_SUPER_JOURNAL and SQLITE_OPEN_WAL,
 * combined. A slot with another type is freed at setup.
 */
export const sahPoolPersistentFileTypes =
  SQLITE_OPEN_MAIN_DB |
  SQLITE_OPEN_MAIN_JOURNAL |
  SQLITE_OPEN_SUPER_JOURNAL |
  SQLITE_OPEN_WAL;

/** The pool subdirectory that holds the slots. Renaming it orphans them. */
export const sahPoolOpaqueDirectoryName = ".opaque";

// What opfs-sahpool's xSectorSize returns.
const sahPoolSectorSize = 4096;

/** The number of slots setup ensures: a database, its journal, and spares. */
export const sahPoolDefaultCapacity = 6;

/**
 * Computes the digest of a header's first {@link sahPoolHeaderCorpusSize} bytes,
 * as opfs-sahpool does.
 *
 * Without {@link sahPoolDigestV2Flag} in the flags, the digest is the legacy
 * `[0, 0]`. Otherwise `h1` starts at `0xdeadbeef` and `h2` at `0x41c6ce57`; for
 * each byte, `h1 = Math.imul(h1 ^ byte, 2654435761)` and `h2 = Math.imul(h2 ^
 * byte, 104729)`; the digest is `[h1 >>> 0, h2 >>> 0]`. The result's bytes are
 * written to the header as they are.
 */
export const computeSahPoolDigest = (
  corpus: Uint8Array,
  flags: number,
): Uint32Array<ArrayBuffer> => {
  if ((flags & sahPoolDigestV2Flag) === 0) return new Uint32Array(2);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const byte of corpus) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 104729);
  }
  return Uint32Array.of(h1 >>> 0, h2 >>> 0);
};

const utf8Encoder = /*#__PURE__*/ new TextEncoder();
// Keeps a leading byte order mark, which the default decoder strips, so a
// header's path decodes as written.
const utf8Decoder = /*#__PURE__*/ new TextDecoder("utf-8", { ignoreBOM: true });

/** A file of the pool and its sync access handle. */
interface Slot {
  readonly fileName: string;
  readonly handle: OpfsSyncAccessHandle;
}

/** The names of the VFS and I/O methods that need a pool's files. */
type SahPoolMethodName =
  | "xOpen"
  | "xDelete"
  | "xAccess"
  | "xClose"
  | "xRead"
  | "xWrite"
  | "xTruncate"
  | "xSync"
  | "xFileSize"
  | "xLock"
  | "xUnlock"
  | "xCheckReservedLock"
  | "xFileControl";

/**
 * The methods that need a pool's files, with the arguments SQLite passes,
 * including the VFS or the file.
 */
type SahPoolMethods = Readonly<
  Record<SahPoolMethodName, SqliteWasmFunction["fn"]>
>;

/** A file SQLite opened. */
interface OpenFile {
  readonly path: string;
  readonly slot: Slot;
  readonly lock: SqliteLockLevel;
  /** The name SQLite passed to `xOpen`, which a journal's name leads back to. */
  readonly zName: CStringPtr | 0;
  /** How the file is encrypted, or null for a file stored as SQLite writes it. */
  readonly cipher: FileCipher | null;
}

/** How an encrypted file is encrypted. */
type FileCipher = DatabaseCipher | JournalCipher;

/** A main database, encrypted page by page. */
interface DatabaseCipher extends Typed<"Database"> {
  readonly codec: SahPoolCodec;
}

/** A rollback journal, whose records' pages its database's codec encrypts. */
interface JournalCipher extends Typed<"Journal"> {
  readonly codec: SahPoolCodec;
  readonly records: JournalRecords;
}

/**
 * The lock of a path, as `unixInodeInfo` in `os_unix.c` keeps it: the level of
 * the connection that holds the most, and how many hold SHARED or more.
 */
interface PathLock {
  readonly level: SqliteLockLevel;
  readonly shared: number;
}

/** The VFS of a pool directory, registered once per instance. */
interface SahPoolRegistration {
  /** The `sqlite3_io_methods` struct a successful `xOpen` sets. */
  readonly ioMethods: WasmPtr;
  /** Hands the VFS to a pool's methods, or pauses it with null. */
  readonly setMethods: (methods: SahPoolMethods | null) => void;
}

// The VFS names of the pools each instance has open or is opening.
const claimedVfsNamesByTable = /*#__PURE__*/ new WeakMap<
  WebAssembly.Table,
  Set<string>
>();

// The registered VFS of each pool directory, by the instance's function table.
const registrationsByTable = /*#__PURE__*/ new WeakMap<
  WebAssembly.Table,
  Map<string, SahPoolRegistration>
>();

/**
 * Allocates and registers a VFS whose methods call the active pool's, never to
 * be freed.
 */
const registerSahPoolVfs = (
  deps: RandomBytesDep & ReportDefectDep & SqliteWasmDep & TimeDep,
  vfsName: string,
): Result<
  SahPoolRegistration,
  SqliteNoMemError | SqliteWasmInitializeError
> => {
  const { randomBytes, sqliteWasm, time } = deps;

  // Null while paused, when no file can be open.
  let methods: SahPoolMethods | null = null;

  const callMethod = (
    name: SahPoolMethodName,
    args: ReadonlyArray<unknown>,
  ): number => {
    assert(methods != null, "The pool is paused.");
    return (methods[name] as (...args: ReadonlyArray<unknown>) => number)(
      ...args,
    );
  };
  const forward =
    (name: SahPoolMethodName) =>
    (...args: ReadonlyArray<unknown>): number =>
      callMethod(name, args);

  const { members } = sqlite3_vfs_layout;
  const vfsMethods: NonEmptyReadonlyArray<
    readonly [keyof typeof members, SqliteWasmFunction["fn"]]
  > = [
    [
      "xOpen",
      (
        vfs: SqliteVfsPtr,
        zName: CStringPtr,
        pFile: SqliteFilePtr,
        flags: number,
        pOutFlags: WasmPtr | 0,
      ) => {
        // A failed open leaves it NULL, so SQLite does not call xClose.
        sqliteWasm
          .getHeapDataView()
          .setInt32(
            pFile + sqlite3_file_layout.members.pMethods.offset,
            0,
            true,
          );
        if (methods == null) return SQLITE_CANTOPEN;
        return callMethod("xOpen", [vfs, zName, pFile, flags, pOutFlags]);
      },
    ],
    [
      "xDelete",
      (...args: ReadonlyArray<unknown>) =>
        methods == null ? SQLITE_IOERR_DELETE : callMethod("xDelete", args),
    ],
    [
      "xAccess",
      (
        vfs: SqliteVfsPtr,
        zName: CStringPtr,
        flags: number,
        pResOut: WasmPtr,
      ) => {
        if (methods != null)
          return callMethod("xAccess", [vfs, zName, flags, pResOut]);
        sqliteWasm.getHeapDataView().setInt32(pResOut, 0, true);
        return SQLITE_OK;
      },
    ],
    [
      "xFullPathname",
      (_vfs: SqliteVfsPtr, zName: CStringPtr, nOut: number, pOut: WasmPtr) => {
        const heap = sqliteWasm.getHeapU8();
        // With its NUL.
        const length = heap.indexOf(0, zName) - zName + 1;
        if (length > nOut) return SQLITE_CANTOPEN;
        heap.copyWithin(pOut, zName, zName + length);
        return SQLITE_OK;
      },
    ],
    [
      "xRandomness",
      (_vfs: SqliteVfsPtr, byteLength: number, pOut: WasmPtr) => {
        // In chunks of at most 65536 bytes, as crypto.getRandomValues requires.
        for (let offset = 0; offset < byteLength; offset += 65536)
          sqliteWasm
            .getHeapU8()
            .set(
              randomBytes.create(Math.min(65536, byteLength - offset)),
              pOut + offset,
            );
        return byteLength;
      },
    ],
    // Contention can only come from connections in the same thread, which
    // sleeping cannot resolve.
    ["xSleep", () => 0],
    [
      "xCurrentTime",
      (_vfs: SqliteVfsPtr, pTime: WasmPtr) => {
        sqliteWasm
          .getHeapDataView()
          .setFloat64(pTime, time.now() / 86_400_000 + 2_440_587.5, true);
        return SQLITE_OK;
      },
    ],
    ["xGetLastError", () => 0],
    [
      "xCurrentTimeInt64",
      (_vfs: SqliteVfsPtr, pTime: WasmPtr) => {
        // Milliseconds since the Julian day epoch, noon in Greenwich on
        // November 24, 4714 BC.
        sqliteWasm
          .getHeapDataView()
          .setBigInt64(pTime, BigInt(time.now()) + 210_866_760_000_000n, true);
        return SQLITE_OK;
      },
    ],
  ];
  const ioMembers = sqlite3_io_methods_layout.members;
  const ioMethods: NonEmptyReadonlyArray<
    readonly [keyof typeof ioMembers, SqliteWasmFunction["fn"]]
  > = [
    ["xClose", forward("xClose")],
    ["xRead", forward("xRead")],
    ["xWrite", forward("xWrite")],
    ["xTruncate", forward("xTruncate")],
    ["xSync", forward("xSync")],
    ["xFileSize", forward("xFileSize")],
    ["xLock", forward("xLock")],
    ["xUnlock", forward("xUnlock")],
    ["xCheckReservedLock", forward("xCheckReservedLock")],
    ["xFileControl", forward("xFileControl")],
    ["xSectorSize", () => sahPoolSectorSize],
    // opfs-sahpool returns SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN, which makes
    // SQLite keep a PERSIST or TRUNCATE journal open after it unlocks, but
    // xDelete frees the slot of an open file.
    ["xDeviceCharacteristics", () => 0],
  ];
  const name = utf8Encoder.encode(`${vfsName}\0`);
  // The VFS struct, the I/O methods struct and the name, in one block,
  // allocated through call, so a broken instance throws before anything is
  // allocated or installed.
  const allocated = sqliteWasm.call(() =>
    allocWasm(deps)(
      sqlite3_vfs_layout.sizeof +
        sqlite3_io_methods_layout.sizeof +
        name.length,
    ),
  );
  if (!allocated.ok) return allocated;
  const vfs = allocated.value as WasmPtr as SqliteVfsPtr;
  const ioMethodsPtr = (vfs + sqlite3_vfs_layout.sizeof) as WasmPtr;
  const zName = ioMethodsPtr + sqlite3_io_methods_layout.sizeof;

  const installed = installWasmFunctions(deps)([
    ...mapArray(vfsMethods, ([member, fn]) => ({
      signature: members[member].signature,
      fn,
    })),
    ...mapArray(ioMethods, ([member, fn]) => ({
      signature: ioMembers[member].signature,
      fn,
    })),
  ]);

  return sqliteWasm.call(() => {
    const heap = sqliteWasm.getHeapU8();
    heap.fill(0, vfs, zName);
    heap.set(name, zName);
    const view = sqliteWasm.getHeapDataView();
    for (const [member, value] of [
      ["iVersion", 2],
      ["szOsFile", sqlite3_file_layout.sizeof],
      ["mxPathname", sahPoolHeaderPathSize],
      ["zName", zName],
    ] as const)
      view.setInt32(vfs + members[member].offset, value, true);
    for (const [[member], pointer] of zipArray([
      vfsMethods,
      installed.pointers.slice(0, vfsMethods.length),
    ]))
      view.setInt32(vfs + members[member].offset, pointer, true);
    view.setInt32(ioMethodsPtr + ioMembers.iVersion.offset, 1, true);
    for (const [[member], pointer] of zipArray([
      ioMethods,
      installed.pointers.slice(vfsMethods.length),
    ]))
      view.setInt32(ioMethodsPtr + ioMembers[member].offset, pointer, true);

    const code = sqliteWasm.exports.sqlite3_vfs_register(vfs, 0);
    if (code !== SQLITE_OK) {
      installed[Symbol.dispose]();
      sqliteWasm.exports.sqlite3_free(allocated.value);
      return err({ type: "SqliteWasmInitializeError", code });
    }
    return ok({
      ioMethods: ioMethodsPtr,
      setMethods: (newMethods) => {
        methods = newMethods;
      },
    });
  });
};

/**
 * Writes a slot's header: its path, flags and digest, failing as
 * {@link writeBytes} does.
 */
const writeHeader = (
  handle: OpfsSyncAccessHandle,
  path: string,
  flags: number,
): Result<void, unknown> => {
  const header = new Uint8Array(sahPoolHeaderDigestOffset + 8);
  utf8Encoder.encodeInto(path, header.subarray(0, sahPoolHeaderPathSize));
  new DataView(header.buffer).setUint32(sahPoolHeaderFlagsOffset, flags);
  header.set(
    new Uint8Array(
      computeSahPoolDigest(header.subarray(0, sahPoolHeaderCorpusSize), flags)
        .buffer,
    ),
    sahPoolHeaderDigestOffset,
  );
  return writeBytes(handle, header, 0);
};

/**
 * Whether a path fits a slot's header with its NUL, as opfs-sahpool requires,
 * which allows 510 UTF-8 bytes.
 */
const fitsHeader = (path: string): boolean =>
  utf8Encoder.encode(path).length < sahPoolHeaderPathSize - 1;

/** Returns a random name of letters and digits, as opfs-sahpool creates them. */
const createRandomName = (random: Random): string =>
  random.next().toString(36).slice(2);

/** Whether a value is an error with the name, such as a `DOMException`. */
const hasName = (error: unknown, name: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === name;

/**
 * Whether acquiring a sync access handle failed because another context or
 * instance holds the file.
 */
const isHeldError = (error: unknown): boolean =>
  // WebKit rejects a held file with InvalidStateError, other engines with
  // NoModificationAllowedError, as the spec says
  // (https://bugs.webkit.org/show_bug.cgi?id=326135). WebKit also uses
  // InvalidStateError for a closed or invalid handle and a stopped context. A
  // retry acquires fresh handles from a new listing, and a stopped context
  // ends with its worker, so a bounded retry of those is harmless.
  hasName(error, "NoModificationAllowedError") ||
  hasName(error, "InvalidStateError");

/**
 * Writes all the bytes, failing with what the handle threw, or with a
 * {@link SqliteShortWriteError} when it wrote another count.
 */
const writeBytes = (
  handle: OpfsSyncAccessHandle,
  bytes: Uint8Array<ArrayBuffer>,
  at: number,
): Result<void, unknown> => {
  const written = trySync(
    () => handle.write(bytes, { at }),
    (error) => error,
  );
  if (!written.ok) return written;
  if (written.value === bytes.length) return ok();
  return err({
    type: "SqliteShortWrite",
    requested: bytes.length,
    written: written.value,
  } satisfies SqliteShortWriteError);
};

/**
 * Whether a write failed because storage is full: an error named
 * `QuotaExceededError`, matched by name so subclasses and non-DOMException
 * errors count, or a {@link SqliteShortWriteError}.
 */
const isStorageFull = (error: unknown): boolean =>
  hasName(error, "QuotaExceededError") || isShortWrite(error);

/** Whether a write failed with a {@link SqliteShortWriteError}. */
const isShortWrite = (error: unknown): error is SqliteShortWriteError =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "SqliteShortWrite";

/**
 * Maps a name to the pool's path, as the module documentation describes.
 *
 * A name such as `//[` is not a valid URL. A query, a fragment or a host would
 * swallow the suffix SQLite appends, so `/a?b.db` and its journal
 * `/a?b.db-journal` would both be `/a`, and deleting the journal at commit
 * would delete the database.
 */
const nameToPath = (name: string): Result<string, unknown> => {
  // The paths are compared rather than the host read, because engines parse
  // the host of a file URL differently: Chromium keeps localhost, so every
  // name has a host there (https://github.com/whatwg/url/issues/618), and
  // Firefox discards any host, so `//evolu.db` is `/` without one
  // (https://bugzilla.mozilla.org/show_bug.cgi?id=1507354).
  const paths = trySync(
    () =>
      [
        new URL(name, "file://localhost/").pathname,
        new URL(`${name}-journal`, "file://localhost/").pathname,
      ] as const,
    (error) => error,
  );
  if (!paths.ok) return paths;
  const [path, journalPath] = paths.value;
  if (journalPath !== `${path}-journal`)
    return err({
      type: "SahPoolInvalidPath",
      name,
    } satisfies SahPoolInvalidPathError);
  return ok(path);
};

/** The encryption of a database file, over keys it zeroes when disposed. */
interface SahPoolCodec extends Disposable {
  /**
   * Encrypts a whole page into a buffer of the codec, which stays valid until
   * the next call, or returns null for a page 1 that reserves other than the 80
   * bytes of the IV and the HMAC or stores another page size than its length.
   */
  readonly encryptPage: (
    pageNumber: number,
    page: Uint8Array,
  ) => Uint8Array<ArrayBuffer> | null;

  /**
   * Authenticates a whole page and decrypts it in place, returning false and
   * leaving it as it was when its HMAC differs or, for page 1, when it does not
   * reserve 80 bytes. A page 1 that authenticates gives the codec its salt.
   */
  readonly decryptPage: (pageNumber: number, page: Uint8Array) => boolean;

  /**
   * Takes the salt a database's page 1 stores, read as stored, until a page 1
   * that authenticates stores another.
   */
  readonly useSalt: (salt: Uint8Array) => void;

  /**
   * Whether a page 1, of the database or of a journal record, has
   * authenticated, which proves the key right.
   */
  readonly isKeyProven: () => boolean;
}

/** Creates the codec of a database file, which takes ownership of the key. */
const createSahPoolCodec = ({
  key,
  randomBytes,
}: {
  key: Uint8Array<ArrayBuffer>;
  randomBytes: RandomBytes;
}): SahPoolCodec => {
  // Null until the codec reads or writes a page 1.
  let salted: SaltHmacKey | null = null;
  let output = new Uint8Array(0);
  // Never reset, because the key is fixed.
  let isPage1Authenticated = false;
  using disposer = new DisposableStack();
  disposer.defer(() => {
    key.fill(0);
    salted?.hmacKey.fill(0);
  });

  // The codec's salt and HMAC key for its own salt, and otherwise a copy of
  // the salt with an HMAC key derived anew, which the caller adopts or zeroes.
  const hmacKeyForSalt = (salt: Uint8Array): SaltHmacKey => {
    if (salted != null && eqUint8Array(salted.salt, salt)) return salted;
    const copy = salt.slice();
    return {
      salt: copy,
      hmacKey: pbkdf2(sha512)(
        key,
        copy.map((byte) => byte ^ hmacSaltMask),
        { c: 2, dkLen: 32 },
      ),
    };
  };

  // Makes a salt and its HMAC key the codec's, zeroing the previous HMAC key.
  const adoptSalt = (next: SaltHmacKey): void => {
    if (next === salted) return;
    salted?.hmacKey.fill(0);
    salted = next;
  };

  // HMAC-SHA512 of the encrypted bytes, the IV and the page number.
  const computeHmac = (
    pageNumber: number,
    page: Uint8Array,
    pageHmacKey: Uint8Array,
    out: Uint8Array,
  ): void => {
    const pageNumberLe = new Uint8Array(4);
    new DataView(pageNumberLe.buffer).setUint32(0, pageNumber, true);
    hmac
      .create(sha512, pageHmacKey)
      .update(page.subarray(encryptedStart(pageNumber), page.length - hmacSize))
      .update(pageNumberLe)
      .digestInto(out);
  };

  return disposable<SahPoolCodec>(
    {
      encryptPage: (pageNumber, page) => {
        // Byte 20 is the reserved bytes. A VACUUM that changes the page size
        // writes page 1 with the new size in pages of the old one.
        if (
          pageNumber === 1 &&
          (page[20] !== reservedSize || storedPageSize(page) !== page.length)
        )
          return null;
        if (output.length !== page.length) output = new Uint8Array(page.length);
        const start = encryptedStart(pageNumber);
        const end = page.length - reservedSize;
        salted ??= hmacKeyForSalt(randomBytes.create(saltSize));
        const { salt, hmacKey } = salted;
        const iv = randomBytes.create(ivSize);
        encryptCbcCs3(
          key,
          iv,
          page.subarray(start, end),
          output.subarray(start, end),
        );
        if (pageNumber === 1) {
          output.set(salt, 0);
          output.set(page.subarray(saltSize, encryptedStart(1)), saltSize);
        }
        output.set(iv, end);
        computeHmac(pageNumber, output, hmacKey, output.subarray(end + ivSize));
        return output;
      },
      decryptPage: (pageNumber, page) => {
        // The HMAC does not cover byte 20, the reserved bytes, with which
        // SQLite would read every page at another usable size.
        if (pageNumber === 1 && page[20] !== reservedSize) return false;
        const pageSalted =
          pageNumber === 1
            ? hmacKeyForSalt(page.subarray(0, saltSize))
            : salted;
        if (pageSalted == null) return false;
        const start = encryptedStart(pageNumber);
        const end = page.length - reservedSize;
        const expected = new Uint8Array(hmacSize);
        computeHmac(pageNumber, page, pageSalted.hmacKey, expected);
        // In constant time.
        let difference = 0;
        for (const [index, byte] of expected.entries())
          difference |= byte ^ page[end + ivSize + index];
        // A page 1 that fails to authenticate, such as a stale page in a
        // journal or one a power loss tore, would give its salt to every page
        // written later.
        if (difference !== 0) {
          if (pageSalted !== salted) pageSalted.hmacKey.fill(0);
          return false;
        }
        adoptSalt(pageSalted);
        decryptCbcCs3(
          key,
          page.slice(end, end + ivSize),
          page.subarray(start, end),
          page.subarray(start, end),
        );
        if (pageNumber === 1) {
          page.set(sqliteHeaderString);
          isPage1Authenticated = true;
        }
        return true;
      },
      useSalt: (salt) => {
        adoptSalt(hmacKeyForSalt(salt));
      },
      isKeyProven: () => isPage1Authenticated,
    },
    disposer,
  );
};

/** A salt page 1 stores and the HMAC key derived from it and the key. */
interface SaltHmacKey {
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly hmacKey: Uint8Array;
}

/**
 * Encrypts with AES-256-CBC, stealing ciphertext for a last partial block as
 * CBC-CS3 does. The output must not overlap the input.
 */
const encryptCbcCs3 = (
  key: Uint8Array,
  iv: Uint8Array,
  input: Uint8Array,
  output: Uint8Array,
): void => {
  const tail = input.length % aesBlockSize;
  const whole = input.length - tail;
  cbc(key, iv, { disablePadding: true }).encrypt(
    input.subarray(0, whole),
    output.subarray(0, whole),
  );
  if (tail === 0) return;
  // The last whole block C becomes the encryption of C XOR the partial block
  // padded with zeros, computed in place, and the partial block the first bytes
  // of C, so no plaintext stays outside the input.
  const last = output.subarray(whole - aesBlockSize, whole);
  output.copyWithin(whole, whole - aesBlockSize, whole - aesBlockSize + tail);
  for (let index = 0; index < tail; index++)
    last[index] ^= input[whole + index];
  cbc(key, zeroIv, { disablePadding: true }).encrypt(last, last);
};

/** Decrypts what {@link encryptCbcCs3} encrypted. The output may be the input. */
const decryptCbcCs3 = (
  key: Uint8Array,
  iv: Uint8Array,
  input: Uint8Array,
  output: Uint8Array,
): void => {
  const tail = input.length % aesBlockSize;
  if (tail === 0) {
    cbc(key, iv, { disablePadding: true }).decrypt(input, output);
    return;
  }
  const whole = input.length - tail;
  // The ciphertext with the last whole block C restored: the partial block holds
  // its first bytes, and the last whole block decrypts to C XOR the partial
  // block padded with zeros, decrypted into the output, so no plaintext stays
  // outside it.
  const blocks = input.slice(0, whole);
  blocks.set(input.subarray(whole), whole - aesBlockSize);
  const last = output.subarray(whole - aesBlockSize, whole);
  cbc(key, zeroIv, { disablePadding: true }).decrypt(
    input.subarray(whole - aesBlockSize, whole),
    last,
  );
  blocks.set(last.subarray(tail), whole - aesBlockSize + tail);
  for (let index = 0; index < tail; index++)
    output[whole + index] = last[index] ^ blocks[whole - aesBlockSize + index];
  cbc(key, iv, { disablePadding: true }).decrypt(
    blocks,
    output.subarray(0, whole),
  );
};

/** Tells which reads and writes of a rollback journal are a record's page. */
interface JournalRecords {
  /**
   * Takes the offset and the bytes of a read, after it, or of a write, before
   * it, and returns the number of the page they are, or null.
   */
  readonly track: (at: number, bytes: Uint8Array) => number | null;
}

/**
 * Creates the {@link JournalRecords} of a journal: a page's size at offset P +
 * 4, right after 4 bytes at P, is the page those bytes number, unless they were
 * the checksum right after the previous record's page.
 */
const createJournalRecords = (): JournalRecords => {
  // Where the page whose number was just read or written starts, and the
  // number, 0 for none.
  let pageAt = -1;
  let pageNumber = 0;
  // Where the checksum after the page just read or written starts.
  let checksumAt = -1;
  return {
    track: (at, bytes) => {
      const number = pageNumber;
      const isPage = number > 0 && at === pageAt && isPageSize(bytes.length);
      const isNumber = bytes.length === 4 && at !== checksumAt;
      pageAt = isNumber ? at + 4 : -1;
      pageNumber = isNumber
        ? new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0)
        : 0;
      checksumAt = isPage ? at + bytes.length : -1;
      return isPage ? number : null;
    },
  };
};

/**
 * Authenticates a copy of the page of a rollback journal's first page-1 record,
 * which proves the key and gives the codec its salt, and zeroes the copy.
 * Returns false when the page fails to authenticate or the journal has no such
 * record.
 *
 * It reads the journal much as SQLite reads a hot one: the sector and page
 * sizes from the first header, and segments that each start with a header at a
 * multiple of the sector size, with SQLite's magic and the number of records
 * that follow it, where 0xFFFFFFFF counts the records up to the end of the
 * file. A count of 0 does too, although a hot journal's rollback takes it as
 * none: any page 1 that authenticates stores the database's salt, so a page 1
 * past the records SQLite would play back still gives the right salt. A record
 * is the page number in 4 bytes, big-endian, the page and a 4-byte checksum.
 */
const authenticateJournalPage1 = (
  handle: OpfsSyncAccessHandle,
  codec: SahPoolCodec,
): boolean => {
  const size = handle.getSize() - sahPoolHeaderSize;
  const read = (bytes: Uint8Array<ArrayBuffer>, at: number): void => {
    handle.read(bytes, { at: sahPoolHeaderSize + at });
  };
  // A journal shorter than a header has zeros for both sizes.
  const header = new Uint8Array(28);
  const view = new DataView(header.buffer);
  read(header, 0);
  const sectorSize = view.getUint32(20);
  const pageSize = view.getUint32(24);
  if (
    sectorSize < 32 ||
    sectorSize > 65536 ||
    (sectorSize & (sectorSize - 1)) !== 0 ||
    !isPageSize(pageSize)
  )
    return false;
  const recordSize = pageSize + 8;
  const pageNumber = new Uint8Array(4);
  for (let at = 0; at + sectorSize <= size;) {
    read(header, at);
    if (!eqUint8Array(header.subarray(0, 8), journalMagic)) break;
    const count = view.getUint32(8);
    const end =
      count === 0 || count === 0xffffffff
        ? size
        : Math.min(size, at + sectorSize + count * recordSize);
    let recordAt = at + sectorSize;
    for (; recordAt + recordSize <= end; recordAt += recordSize) {
      read(pageNumber, recordAt);
      if (new DataView(pageNumber.buffer).getUint32(0) !== 1) continue;
      const page = new Uint8Array(pageSize);
      read(page, recordAt + 4);
      const authenticated = codec.decryptPage(1, page);
      page.fill(0);
      return authenticated;
    }
    at = Math.ceil(recordAt / sectorSize) * sectorSize;
  }
  return false;
};

/**
 * The number of the page a database read or write of whole page is, null for
 * one that is not.
 */
const toPageNumber = (at: number, byteLength: number): number | null =>
  isPageSize(byteLength) && at % byteLength === 0 ? at / byteLength + 1 : null;

/**
 * The page size page 1 stores unencrypted in bytes 16 and 17, big-endian, with
 * 1 for 65536, which may be no page size.
 */
const storedPageSize = (page1: Uint8Array): number => {
  const size = (page1[16] << 8) | page1[17];
  return size === 1 ? 65536 : size;
};

/** Whether a byte count is a page size: a power of two from 512 to 65536. */
const isPageSize = (byteLength: number): boolean =>
  byteLength >= 512 &&
  byteLength <= 65536 &&
  (byteLength & (byteLength - 1)) === 0;

/** Where the encrypted bytes of a page start. */
const encryptedStart = (pageNumber: number): number =>
  pageNumber === 1 ? 24 : 0;

const aesBlockSize = 16;
const saltSize = 16;
const ivSize = 16;
const hmacSize = 64;
// The IV and the HMAC at the end of every page.
const reservedSize = ivSize + hmacSize;
const hmacSaltMask = 0x3a;
const zeroIv = /*#__PURE__*/ new Uint8Array(aesBlockSize);
const encryptionUnsupported: SahPoolEncryptionUnsupportedError = {
  type: "SahPoolEncryptionUnsupported",
};
// The values of PRAGMA secure_delete an encrypted database takes, in lower
// case, as SQLite compares them without case.
const secureDeleteOnValues = /*#__PURE__*/ new Set(["on", "yes", "true", "1"]);
const sqliteHeaderString =
  /*#__PURE__*/ utf8Encoder.encode("SQLite format 3\0");
// What starts every header of a rollback journal.
const journalMagic = /*#__PURE__*/ Uint8Array.of(
  0xd9,
  0xd5,
  0x05,
  0xf9,
  0x20,
  0xa1,
  0x63,
  0xd7,
);
