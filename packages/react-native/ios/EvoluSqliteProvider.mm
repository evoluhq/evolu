// Returns the C++ TurboModule EvoluSqlite, as codegenConfig's ios.modules
// names this class for it.
//
// With RN_STRICT_API, React Native's umbrella headers come first, in this
// order, so the guarded headers that RCTTurboModule.h includes directly are
// already included.
#import <React/CallInvoker.h>
#import <React/Timing.h>

#import <ReactCommon/RCTTurboModule.h>

#import "EvoluSqlite.h"

@interface EvoluSqliteProvider : NSObject <RCTModuleProvider>
@end

@implementation EvoluSqliteProvider

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<EvoluSqlite>(params.jsInvoker);
}

@end
