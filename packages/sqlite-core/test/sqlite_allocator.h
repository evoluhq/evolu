/*
 * SQLite's allocator as the C runner installs it, before SQLite initializes:
 * the default one, except that a test can make SQLite's allocations fail and
 * see them. test_sqlite_allocations_left counts them as
 * evolu_test_allocations_left counts the core's own: at -1, the default, none
 * fails; from 0 up, each takes one, and the one that finds 0 fails and leaves
 * it at -2, where every later one fails too. A build with AddressSanitizer
 * turns SQLite's lookaside off, so every allocation reaches it.
 *
 * Hooks a test sets, NULL by default, see each allocation that succeeded with
 * its pointer and size, each reallocation before it's made with the pointer
 * it reallocates, and each free before it's made with the pointer and its
 * allocation's size, so a test can read the bytes being freed.
 */
#ifndef EVOLU_TEST_SQLITE_ALLOCATOR_H
#define EVOLU_TEST_SQLITE_ALLOCATOR_H

extern int test_sqlite_allocations_left;
extern void (*test_sqlite_malloc_hook)(void *p, int size);
extern void (*test_sqlite_realloc_hook)(void *p, int size);
extern void (*test_sqlite_free_hook)(void *p, int size);

/* Installs the allocator; returns SQLite's result. */
int test_install_sqlite_allocator(void);

#endif
