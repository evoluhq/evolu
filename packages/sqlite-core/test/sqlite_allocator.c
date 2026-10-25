#include "sqlite_allocator.h"

#include "sqlite3.h"

#include <stddef.h>

int test_sqlite_allocations_left = -1;
int test_sqlite_allocations_until_one_fails = -1;
void (*test_sqlite_malloc_hook)(void *p, int size);
void (*test_sqlite_realloc_hook)(void *p, int size);
void (*test_sqlite_free_hook)(void *p, int size);

static sqlite3_mem_methods default_methods;

static int allocation_fails(void) {
  if (test_sqlite_allocations_until_one_fails >= 0 &&
      test_sqlite_allocations_until_one_fails-- == 0) {
    test_sqlite_allocations_until_one_fails = -2;
    return 1;
  }
  if (test_sqlite_allocations_left > 0) {
    test_sqlite_allocations_left--;
    return 0;
  }
  if (test_sqlite_allocations_left == -1) return 0;
  test_sqlite_allocations_left = -2;
  return 1;
}

static void *test_malloc(int size) {
  void *p = allocation_fails() ? NULL : default_methods.xMalloc(size);
  if (p != NULL && test_sqlite_malloc_hook != NULL)
    test_sqlite_malloc_hook(p, size);
  return p;
}

static void *test_realloc(void *p, int size) {
  if (test_sqlite_realloc_hook != NULL) test_sqlite_realloc_hook(p, size);
  return allocation_fails() ? NULL : default_methods.xRealloc(p, size);
}

static void test_free(void *p) {
  if (test_sqlite_free_hook != NULL)
    test_sqlite_free_hook(p, default_methods.xSize(p));
  default_methods.xFree(p);
}

int test_install_sqlite_allocator(void) {
  int rc = sqlite3_config(SQLITE_CONFIG_GETMALLOC, &default_methods);
  if (rc != SQLITE_OK) return rc;
  sqlite3_mem_methods methods = default_methods;
  methods.xMalloc = test_malloc;
  methods.xRealloc = test_realloc;
  methods.xFree = test_free;
  return sqlite3_config(SQLITE_CONFIG_MALLOC, &methods);
}
