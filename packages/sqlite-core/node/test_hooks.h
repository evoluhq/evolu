/*
 * The test addon's hooks in node/binding.c and node/module.c, which
 * scripts/build-addon.mts includes before each of them with -include, and
 * node/addon.c defines. @evolu/nodejs's build compiles both without it, so the
 * addon it ships is the code the hooks wrap, unchanged.
 *
 * - One call of theirs can fail before it runs, so a test reaches every path
 *   that handles a failure no test could otherwise cause. As
 *   evolu_test_allocations_left counts the core's allocations,
 *   evolu_test_node_calls_left counts the calls: at -1, the default, none
 *   fails; from 0 up, each takes one, and the one that finds 0 fails alone,
 *   leaving it at -1. The calls are their own allocations, which then return
 *   NULL; the Node-API calls whose status they check, which return
 *   napi_generic_failure with no error info of their own, so the last call's
 *   stays; the SQLite calls whose NULL they check, which return it, as SQLite
 *   does without memory; evolu_database_open_memory, which fails as the
 *   binding layer does without memory; and module.c's sqlite3_auto_extension,
 *   which returns SQLITE_NOMEM. With evolu_test_node_only_allocations, only
 *   the allocations count, so a call whose values grow arrays the environment
 *   kept fails each growth in turn, whichever Node-API calls a cache saves.
 * - evolu_test_node_blocks counts the blocks their own allocations hold, which
 *   free releases, so a test sees that a failure leaks none, also where
 *   LeakSanitizer doesn't run, as on Apple's arm64.
 * - evolu_test_node_statements counts the statements their
 *   evolu_database_prepare prepared and their sqlite3_finalize didn't
 *   finalize, so a test sees that a failure leaks none, which LeakSanitizer
 *   can't, since the close of its database finalizes it. One the close
 *   finalizes stays counted.
 * - evolu_test_node_key_wipes counts each evolu_database_wipe that zeroes
 *   exactly the key the last evolu_database_open_encrypted_file got,
 *   evolu_test_node_exports each buffer evolu_database_export handed over,
 *   and evolu_test_node_freed_exports each evolu_database_free_export of the
 *   last one, with its size, which binding_test.c checks frees it wiped.
 * - evolu_test_node_slots is binding.c's EVOLU_NODE_SLOTS, the most slots an
 *   environment's handles take, UINT32_MAX by default, so a test fills them.
 *
 * Each is the calling thread's, so a Node.js environment, such as a worker
 * thread's, counts only its own calls.
 */
#ifndef EVOLU_NODE_TEST_HOOKS_H
#define EVOLU_NODE_TEST_HOOKS_H

// Every header the files include comes first, so the macros below rename only
// the files' own calls.
#include <node_api.h>

#include "evolu_database.h"
#include "evolu_xchacha.h"

#include <math.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

extern _Thread_local int evolu_test_node_calls_left;
extern _Thread_local bool evolu_test_node_only_allocations;
extern _Thread_local int64_t evolu_test_node_blocks;
extern _Thread_local int64_t evolu_test_node_statements;
extern _Thread_local int evolu_test_node_key_wipes;
extern _Thread_local int evolu_test_node_exports;
extern _Thread_local int evolu_test_node_freed_exports;
extern _Thread_local uint32_t evolu_test_node_slots;

// Whether the call about to run fails, which takes one from
// evolu_test_node_calls_left unless only the allocations count.
bool evolu_test_node_call_fails(void);

void *evolu_test_node_malloc(size_t size);
void *evolu_test_node_calloc(size_t count, size_t size);
void *evolu_test_node_realloc(void *items, size_t size);
void evolu_test_node_free(void *items);
void *evolu_test_node_sqlite3_malloc64(sqlite3_uint64 size);
// Fails as evolu_database_open_memory does without memory.
int evolu_test_node_fail_open(evolu_database **database,
                              evolu_database_error *error);
int evolu_test_node_prepare(evolu_database *database, const char *sql,
                            size_t sql_size, sqlite3_stmt **statement,
                            evolu_database_error *error);
int evolu_test_node_finalize(sqlite3_stmt *statement);
int evolu_test_node_open_encrypted_file(
    const char *path, size_t path_size,
    const uint8_t key[EVOLU_DATABASE_KEY_SIZE], evolu_database **database,
    evolu_database_error *error);
void evolu_test_node_wipe(void *bytes, size_t size);
int evolu_test_node_export(evolu_database *database, uint8_t **bytes,
                           size_t *size, evolu_database_error *error);
void evolu_test_node_free_export(uint8_t *bytes, size_t size);

// node/addon.c, which defines the hooks, declares them only.
#ifndef EVOLU_NODE_TEST_HOOKS_DECLARE_ONLY

#define EVOLU_NODE_SLOTS evolu_test_node_slots

#define malloc(size) evolu_test_node_malloc(size)
#define calloc(count, size) evolu_test_node_calloc(count, size)
#define realloc(items, size) evolu_test_node_realloc(items, size)
#define free(items) evolu_test_node_free(items)
#define sqlite3_malloc64(size) evolu_test_node_sqlite3_malloc64(size)
#define evolu_database_prepare(database, sql, sql_size, statement, error)      \
  evolu_test_node_prepare(database, sql, sql_size, statement, error)
#define sqlite3_finalize(statement) evolu_test_node_finalize(statement)
#define evolu_database_open_encrypted_file(path, path_size, key, database,     \
                                           error)                              \
  evolu_test_node_open_encrypted_file(path, path_size, key, database, error)
#define evolu_database_wipe(bytes, size) evolu_test_node_wipe(bytes, size)
#define evolu_database_export(database, bytes, size, error)                    \
  evolu_test_node_export(database, bytes, size, error)
#define evolu_database_free_export(bytes, size)                                \
  evolu_test_node_free_export(bytes, size)

// A call that fails returns failure without running. Inside its own macro, a
// function's name is the function.
#define EVOLU_TEST_NODE_CALL(failure, call)                                    \
  (evolu_test_node_call_fails() ? (failure) : (call))
#define EVOLU_TEST_NODE_NAPI(call)                                             \
  EVOLU_TEST_NODE_CALL(napi_generic_failure, call)

#define napi_call_function(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_call_function(__VA_ARGS__))
#define napi_check_object_type_tag(...)                                        \
  EVOLU_TEST_NODE_NAPI(napi_check_object_type_tag(__VA_ARGS__))
#define napi_create_arraybuffer(...)                                           \
  EVOLU_TEST_NODE_NAPI(napi_create_arraybuffer(__VA_ARGS__))
#define napi_create_double(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_create_double(__VA_ARGS__))
#define napi_create_error(...)                                                 \
  EVOLU_TEST_NODE_NAPI(napi_create_error(__VA_ARGS__))
#define napi_create_external_arraybuffer(...)                                  \
  EVOLU_TEST_NODE_NAPI(napi_create_external_arraybuffer(__VA_ARGS__))
#define napi_create_function(...)                                              \
  EVOLU_TEST_NODE_NAPI(napi_create_function(__VA_ARGS__))
#define napi_create_int32(...)                                                 \
  EVOLU_TEST_NODE_NAPI(napi_create_int32(__VA_ARGS__))
#define napi_create_int64(...)                                                 \
  EVOLU_TEST_NODE_NAPI(napi_create_int64(__VA_ARGS__))
#define napi_create_object(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_create_object(__VA_ARGS__))
#define napi_create_reference(...)                                             \
  EVOLU_TEST_NODE_NAPI(napi_create_reference(__VA_ARGS__))
#define napi_create_string_latin1(...)                                         \
  EVOLU_TEST_NODE_NAPI(napi_create_string_latin1(__VA_ARGS__))
#define napi_create_string_utf8(...)                                           \
  EVOLU_TEST_NODE_NAPI(napi_create_string_utf8(__VA_ARGS__))
#define napi_create_symbol(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_create_symbol(__VA_ARGS__))
#define napi_create_type_error(...)                                            \
  EVOLU_TEST_NODE_NAPI(napi_create_type_error(__VA_ARGS__))
#define napi_create_typedarray(...)                                            \
  EVOLU_TEST_NODE_NAPI(napi_create_typedarray(__VA_ARGS__))
#define napi_create_uint32(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_create_uint32(__VA_ARGS__))
#define napi_define_class(...)                                                 \
  EVOLU_TEST_NODE_NAPI(napi_define_class(__VA_ARGS__))
#define napi_define_properties(...)                                            \
  EVOLU_TEST_NODE_NAPI(napi_define_properties(__VA_ARGS__))
#define napi_get_array_length(...)                                             \
  EVOLU_TEST_NODE_NAPI(napi_get_array_length(__VA_ARGS__))
#define napi_get_arraybuffer_info(...)                                         \
  EVOLU_TEST_NODE_NAPI(napi_get_arraybuffer_info(__VA_ARGS__))
#define napi_get_boolean(...)                                                  \
  EVOLU_TEST_NODE_NAPI(napi_get_boolean(__VA_ARGS__))
#define napi_get_cb_info(...)                                                  \
  EVOLU_TEST_NODE_NAPI(napi_get_cb_info(__VA_ARGS__))
#define napi_get_element(...)                                                  \
  EVOLU_TEST_NODE_NAPI(napi_get_element(__VA_ARGS__))
#define napi_get_instance_data(...)                                            \
  EVOLU_TEST_NODE_NAPI(napi_get_instance_data(__VA_ARGS__))
#define napi_get_last_error_info(...)                                          \
  EVOLU_TEST_NODE_NAPI(napi_get_last_error_info(__VA_ARGS__))
#define napi_get_named_property(...)                                           \
  EVOLU_TEST_NODE_NAPI(napi_get_named_property(__VA_ARGS__))
#define napi_get_null(...) EVOLU_TEST_NODE_NAPI(napi_get_null(__VA_ARGS__))
#define napi_get_reference_value(...)                                          \
  EVOLU_TEST_NODE_NAPI(napi_get_reference_value(__VA_ARGS__))
#define napi_get_typedarray_info(...)                                          \
  EVOLU_TEST_NODE_NAPI(napi_get_typedarray_info(__VA_ARGS__))
#define napi_get_undefined(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_get_undefined(__VA_ARGS__))
#define napi_get_value_bool(...)                                               \
  EVOLU_TEST_NODE_NAPI(napi_get_value_bool(__VA_ARGS__))
#define napi_get_value_double(...)                                             \
  EVOLU_TEST_NODE_NAPI(napi_get_value_double(__VA_ARGS__))
#define napi_get_value_string_utf16(...)                                       \
  EVOLU_TEST_NODE_NAPI(napi_get_value_string_utf16(__VA_ARGS__))
#define napi_get_value_string_utf8(...)                                        \
  EVOLU_TEST_NODE_NAPI(napi_get_value_string_utf8(__VA_ARGS__))
#define napi_is_array(...) EVOLU_TEST_NODE_NAPI(napi_is_array(__VA_ARGS__))
#define napi_is_exception_pending(...)                                         \
  EVOLU_TEST_NODE_NAPI(napi_is_exception_pending(__VA_ARGS__))
#define napi_is_typedarray(...)                                                \
  EVOLU_TEST_NODE_NAPI(napi_is_typedarray(__VA_ARGS__))
#define napi_new_instance(...)                                                 \
  EVOLU_TEST_NODE_NAPI(napi_new_instance(__VA_ARGS__))
#define napi_set_element(...)                                                  \
  EVOLU_TEST_NODE_NAPI(napi_set_element(__VA_ARGS__))
#define napi_set_instance_data(...)                                            \
  EVOLU_TEST_NODE_NAPI(napi_set_instance_data(__VA_ARGS__))
#define napi_throw(...) EVOLU_TEST_NODE_NAPI(napi_throw(__VA_ARGS__))
#define napi_type_tag_object(...)                                              \
  EVOLU_TEST_NODE_NAPI(napi_type_tag_object(__VA_ARGS__))
#define napi_typeof(...) EVOLU_TEST_NODE_NAPI(napi_typeof(__VA_ARGS__))
#define napi_unwrap(...) EVOLU_TEST_NODE_NAPI(napi_unwrap(__VA_ARGS__))
#define napi_wrap(...) EVOLU_TEST_NODE_NAPI(napi_wrap(__VA_ARGS__))
#define node_api_create_property_key_utf8(...)                                 \
  EVOLU_TEST_NODE_NAPI(node_api_create_property_key_utf8(__VA_ARGS__))

#define sqlite3_column_text(...)                                               \
  EVOLU_TEST_NODE_CALL(NULL, sqlite3_column_text(__VA_ARGS__))
#define sqlite3_column_blob(...)                                               \
  EVOLU_TEST_NODE_CALL(NULL, sqlite3_column_blob(__VA_ARGS__))
#define sqlite3_column_name(...)                                               \
  EVOLU_TEST_NODE_CALL(NULL, sqlite3_column_name(__VA_ARGS__))
#define evolu_database_open_memory(database, error)                            \
  EVOLU_TEST_NODE_CALL(evolu_test_node_fail_open(database, error),             \
                       evolu_database_open_memory(database, error))
#define sqlite3_auto_extension(...)                                            \
  EVOLU_TEST_NODE_CALL(SQLITE_NOMEM, sqlite3_auto_extension(__VA_ARGS__))

#endif

#endif
