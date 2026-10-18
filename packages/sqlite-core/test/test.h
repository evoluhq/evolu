/*
 * A minimal test harness for the C core, portable to every compiler the core
 * targets: no constructors, no registration macros that need compiler
 * extensions. Each test file defines its tests as functions and a suite
 * function that runs them with RUN; runner.c calls the suites.
 *
 * A failed CHECK reports the file, line and expression, marks the running test
 * failed and returns from the test function, so CHECK belongs in test bodies,
 * not in helpers that return values.
 */
#ifndef EVOLU_TEST_H
#define EVOLU_TEST_H

#include <stddef.h>

void test_run(const char *name, void (*test)(void));
void test_fail(const char *file, int line, const char *message);
int test_bytes_equal(const void *a, const void *b, size_t length);
int test_strings_equal(const char *a, const char *b);

#define RUN(test) test_run(#test, test)

#define CHECK(condition)                                                       \
  do {                                                                         \
    if (!(condition)) {                                                        \
      test_fail(__FILE__, __LINE__, #condition);                               \
      return;                                                                  \
    }                                                                          \
  } while (0)

#define CHECK_EQ_INT(actual, expected)                                         \
  do {                                                                         \
    long long test_actual_ = (long long)(actual);                              \
    long long test_expected_ = (long long)(expected);                          \
    if (test_actual_ != test_expected_) {                                      \
      test_fail(__FILE__, __LINE__, #actual " == " #expected);                 \
      return;                                                                  \
    }                                                                          \
  } while (0)

#define CHECK_EQ_STR(actual, expected)                                         \
  CHECK(test_strings_equal((actual), (expected)))

#define CHECK_EQ_BYTES(actual, expected, length)                               \
  CHECK(test_bytes_equal((actual), (expected), (length)))

#endif
