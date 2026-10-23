// With RN_STRICT_API, React Native's umbrella headers come first, in this
// order, so the guarded headers that the generated spec header includes
// directly are already included.
#include <React/CallInvoker.h>
#include <React/Timing.h>

#include "EvoluSqlite.h"

#include "EvoluSqliteBinding.h"

EvoluSqlite::EvoluSqlite(
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
    : NativeEvoluSqliteCxxSpec(std::move(jsInvoker)),
      connections_(evolu::createRuntimeConnections()) {}

EvoluSqlite::~EvoluSqlite() {
  evolu::teardownRuntimeConnections(*connections_);
}

facebook::jsi::Object EvoluSqlite::createBinding(facebook::jsi::Runtime &rt) {
  return evolu::createBinding(rt, connections_);
}
