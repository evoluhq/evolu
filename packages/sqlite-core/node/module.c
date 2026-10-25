/*
 * The entry of @evolu/nodejs's Node-API addon, which that package's
 * scripts/build-native.mts builds for every target it ships: it exports
 * node/binding.c's createBinding, which @evolu/nodejs's loader calls, and
 * nothing else. node/addon.c is the entry of the test-only addon.
 *
 * Every file connection of the addon waits up to 5 seconds for a lock another
 * process holds, such as a backup tool's. The binding's opens read the schema
 * before they return, so the timeout is set by an automatic extension, which
 * SQLite runs inside sqlite3_open_v2, before that read. React Native's adapter
 * registers none, so its connections keep SQLite's 0.
 */
#include <node_api.h>
#include <sqlite3.h>

// node/binding.c's createBinding.
napi_value evolu_node_create_binding(napi_env env, napi_callback_info info);

// A memory database, including an export's copy, has no lock to wait for.
static int set_busy_timeout(sqlite3 *db, char **message,
                            const sqlite3_api_routines *api) {
  (void)message;
  (void)api;
  if (*sqlite3_db_filename(db, "main") != '\0') sqlite3_busy_timeout(db, 5000);
  return SQLITE_OK;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor property = {
      "createBinding", NULL, evolu_node_create_binding, NULL, NULL, NULL,
      napi_enumerable, NULL};
  // Registering it again, from another environment such as a worker thread,
  // does nothing.
  if (sqlite3_auto_extension((void (*)(void))set_busy_timeout) != SQLITE_OK) {
    napi_throw_error(env, NULL, "Evolu's SQLite addon failed to initialize.");
    return NULL;
  }
  if (napi_define_properties(env, exports, 1, &property) != napi_ok) {
    bool pending = false;
    if (napi_is_exception_pending(env, &pending) == napi_ok && !pending)
      napi_throw_error(env, NULL, "Evolu's SQLite addon failed to initialize.");
    return NULL;
  }
  return exports;
}
