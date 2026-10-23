// The TurboModule EvoluApp on iOS: the directory of the database files and
// React Native's own reload, so no app needs Expo for either.
//
// With RN_STRICT_API, React Native's umbrella headers come first, in this
// order, so the guarded headers that the generated spec header and
// RCTTurboModule.h include directly are already included.
#import <React/CallInvoker.h>
#import <React/Timing.h>

#import <EvoluReactNativeSpec/EvoluReactNativeSpec.h>
#import <React/RCTReloadCommand.h>

@interface EvoluApp : NSObject <NativeEvoluAppSpec>
@end

@implementation EvoluApp

+ (NSString *)moduleName
{
  return @"EvoluApp";
}

// expo-sqlite's directory, so the databases it wrote open in place. The
// container moves across app updates, so the path is read at every start.
- (NSString *)getDatabaseDirectory
{
  NSURL *documents = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory
                                                          inDomains:NSUserDomainMask]
                         .firstObject;
  return [documents URLByAppendingPathComponent:@"SQLite"].URLByStandardizingPath.path;
}

// RCTHost reloads on this, in every build. It must run on the main thread, and
// synchronously when already there: deferring it on the main thread deadlocks
// a bridgeless reload against the TurboModules' teardown, as Expo notes.
- (void)reloadApp
{
  if (NSThread.isMainThread) {
    RCTTriggerReloadCommandListeners(@"EvoluApp.reloadApp");
  } else {
    dispatch_async(dispatch_get_main_queue(), ^{
      RCTTriggerReloadCommandListeners(@"EvoluApp.reloadApp");
    });
  }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeEvoluAppSpecJSI>(params);
}

@end
