/*
 * The TurboModule EvoluSqlite, a pure C++ module whose one method,
 * createBinding, returns the binding of EvoluSqliteBinding.h for the calling
 * runtime. Each runtime gets a module of its own, which owns the connections
 * its binding opens and closes them when the runtime's teardown destroys it.
 *
 * The app's generated autolinking.cpp compiles this header without Evolu's
 * flags, under -Wall -Werror on Android, so it includes only the codegen spec
 * header and declares the module's state without defining it. The generated
 * provider names the class unqualified, so it's global.
 */
#pragma once

#if __has_include(<EvoluReactNativeSpecJSI.h>)
#include <EvoluReactNativeSpecJSI.h>
#else
#include <EvoluReactNativeSpec/EvoluReactNativeSpecJSI.h>
#endif

#include <memory>

namespace evolu {
class RuntimeConnections;
}

class EvoluSqlite
    : public facebook::react::NativeEvoluSqliteCxxSpec<EvoluSqlite> {
public:
  explicit EvoluSqlite(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker);
  ~EvoluSqlite() override;

  facebook::jsi::Object createBinding(facebook::jsi::Runtime &rt);

private:
  const std::shared_ptr<evolu::RuntimeConnections> connections_;
};
