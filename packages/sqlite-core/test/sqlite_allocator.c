#include "sqlite_allocator.h"

#include "sqlite3.h"

#include <stddef.h>

int test_sqlite_allocations_left = -1;

static sqlite3_mem_methods default_methods;

static int allocation_fails(void) {
  if (test_sqlite_allocations_left > 0) {
    test_sqlite_allocations_left--;
    return 0;
  }
  if (test_sqlite_allocations_left == -1) return 0;
  test_sqlite_allocations_left = -2;
  return 1;
}

static void *test_malloc(int size) {
  return allocation_fails() ? NULL : default_methods.xMalloc(size);
}

static void *test_realloc(void *p, int size) {
  return allocation_fails() ? NULL : default_methods.xRealloc(p, size);
}

int test_install_sqlite_allocator(void) {
  int rc = sqlite3_config(SQLITE_CONFIG_GETMALLOC, &default_methods);
  if (rc != SQLITE_OK) return rc;
  sqlite3_mem_methods methods = default_methods;
  methods.xMalloc = test_malloc;
  methods.xRealloc = test_realloc;
  return sqlite3_config(SQLITE_CONFIG_MALLOC, &methods);
}
