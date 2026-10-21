/*
 * The SQLite compile options of every native build of Evolu's SQLite core
 * (React Native, Node.js and host tests). Builds compile sqlite3.c with
 * -DSQLITE_CUSTOM_INCLUDE=sqlite_config.h, which SQLite includes before its own
 * defaults, so every native toolchain gets the same options from one place.
 *
 * The wasm build keeps the fixed settings of SQLite's ext/wasm, including
 * SQLITE_THREADSAFE=0; it shares the options below that apply to it.
 */
#ifndef EVOLU_SQLITE_CONFIG_H
#define EVOLU_SQLITE_CONFIG_H

/*
 * The builds of Evolu's native package define EVOLU_NATIVE_PACKAGE and compile
 * each C source through a wrapper that includes evolu_names.h first, which
 * renames every global symbol, so another SQLite in the app never binds to
 * this one. SQLite compiled without its wrapper stops here, and every core and
 * binding unit at the same guard in evolu_crypto.h and evolu_database.h.
 */
#if defined(EVOLU_NATIVE_PACKAGE) && !defined(EVOLU_NAMES_H)
#error "Compile Evolu's native C through its units, which include evolu_names.h first."
#endif

/*
 * Multi-thread mode: SQLite's global state is protected, and each connection
 * is opened with SQLITE_OPEN_NOMUTEX, because one thread owns it.
 */
#define SQLITE_THREADSAFE 2

/*
 * Temporary files stay in memory, so sorter spills, temporary tables and
 * statement journals never reach the disk as plaintext. The codec VFS also
 * refuses other files.
 */
#define SQLITE_TEMP_STORE 3

/*
 * WAL, memory-mapped I/O and direct overflow reads stay as SQLite has them, for
 * plain databases such as the relay's. Codec files refuse all three at runtime,
 * so they never read around the codec (evolu_codec.h).
 */

/*
 * Memory statistics cost a mutex per allocation, so they're off, except in a
 * build that turns them on, as the test addon's does for PRAGMA
 * hard_heap_limit, which only they make fail allocations.
 */
#ifndef SQLITE_DEFAULT_MEMSTATUS
#define SQLITE_DEFAULT_MEMSTATUS 0
#endif
#define SQLITE_OMIT_LOAD_EXTENSION 1
#define SQLITE_DQS 0

/*
 * POSIX advisory locks only, on every platform. SQLite turns its other locking
 * styles on for Apple platforms by default, which expo-sqlite turned off, so
 * the macOS host tests run the locking iOS ships. Unconditional, because the
 * build check requires it among the compile options, which list it only when
 * it is defined. Without HAVE_GETHOSTUUID, which only those styles read,
 * SQLite's gethostuuid block warns on every iOS compile.
 */
#define SQLITE_ENABLE_LOCKING_STYLE 0
#define HAVE_GETHOSTUUID 0

/*
 * SQLite carves small allocations, such as a statement or a value's text, out
 * of each connection's lookaside buffer, inside which AddressSanitizer sees no
 * free, so a build with it turns lookaside off.
 */
#if defined(__has_feature)
#if __has_feature(address_sanitizer)
#define SQLITE_DEFAULT_LOOKASIDE 0, 0
#endif
#elif defined(__SANITIZE_ADDRESS__)
#define SQLITE_DEFAULT_LOOKASIDE 0, 0
#endif

/* The same features as the wasm build's options. */
#define SQLITE_ENABLE_MATH_FUNCTIONS 1
#define SQLITE_OMIT_AUTHORIZATION 1
#define SQLITE_OMIT_INCRBLOB 1
#define SQLITE_OMIT_INTROSPECTION_PRAGMAS 1
#define SQLITE_OMIT_PROGRESS_CALLBACK 1

#endif
