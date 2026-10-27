/*
 * Evolu's SQLite binding over JSI: the JavaScript interface that
 * @evolu/common's NativeSqlite types, over the SQLite core's binding layer,
 * evolu_database.h, as @evolu/sqlite-core's node/binding.c implements it over
 * Node-API. test/bindingConformance.ts pins that both behave alike.
 *
 * This header includes only JSI's, so the module's header and a host test
 * include it without SQLite's or React Native's. EvoluSqlite.cpp, the
 * TurboModule, creates a binding per runtime; test/hermes/host.cpp runs it
 * under Hermes on macOS.
 *
 * ## Lifetimes
 *
 * - The module owns one RuntimeConnections, the connections its runtime's
 *   binding opened, and its destructor tears them down: it closes each, which
 *   rolls back a transaction left open and releases its file, and refuses any
 *   later open.
 * - Host functions keep only that C++ state, never a JSI value, so nothing
 *   outlives the runtime but what the module owns. A handle reaches the
 *   prototype of the handles it creates through its own prototype chain, and
 *   the binding's opens through the database prototype they're bound to.
 * - The garbage collector runs a handle's destructor on any thread, and Hermes
 *   on its own, so a collected handle only drops its reference: a connection
 *   whose handle is gone stays open, holding its file, until close or
 *   teardown. The one destructor that frees anything is an export's, which
 *   wipes and frees its bytes and needs no connection.
 * - Each connection has a recursive mutex, which every call on it, its close
 *   and teardown hold, so a teardown on another thread waits for a call in
 *   progress, and JavaScript that a call runs, such as a parameter's getter,
 *   can close the database. A call that ran JavaScript checks its statement
 *   again before it calls SQLite.
 */
#pragma once

#include <jsi/jsi.h>

#include <memory>

namespace evolu {

/* The connections a runtime's binding opened, which its module owns. */
class RuntimeConnections;

std::shared_ptr<RuntimeConnections> createRuntimeConnections();

/*
 * Closes every connection the binding opened that is still open, waiting for a
 * call in progress on it, and makes later opens throw, as the module's
 * destructor does. A connection that SQLite can't close stays open.
 */
void teardownRuntimeConnections(RuntimeConnections &connections);

/*
 * Checks the build and returns a binding for the runtime whose connections
 * belong to connections, or throws a JSError when the build check fails.
 */
facebook::jsi::Object
createBinding(facebook::jsi::Runtime &runtime,
              const std::shared_ptr<RuntimeConnections> &connections);

} // namespace evolu

#ifdef EVOLU_TEST_HOOKS
#include <cstddef>
#include <cstdint>

/*
 * A hook of the Hermes host's build, which alone defines EVOLU_TEST_HOOKS for
 * the adapter: when set, an encrypted open calls it with its copy of the key
 * once it wiped the copy, so a test can check that the wipe zeroes every byte.
 * Since the hook reads the copy, it also keeps a plain store to the copy that a
 * build without the hook drops, which only the cross-compile notices, as it
 * requires the adapter to call evolu_database_wipe.
 */
extern void (*evolu_test_key_copy_end)(const uint8_t *copy, size_t size);
#endif
