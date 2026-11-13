// The TurboModule EvoluApp on iOS: the directory of the database files, React
// Native's own reload, and the app's DeviceSecret in the Keychain, so no app
// needs Expo for any of them.
//
// With RN_STRICT_API, React Native's umbrella headers come first, in this
// order, so the guarded headers that the generated spec header and
// RCTTurboModule.h include directly are already included.
#import <React/CallInvoker.h>
#import <React/Timing.h>

#import <EvoluReactNativeSpec/EvoluReactNativeSpec.h>
#import <React/RCTReloadCommand.h>
#import <Security/Security.h>

// The app's Keychain item for appName. The bundle identifier keeps another
// app's record with the same app name from matching, even when both share an
// access group.
static NSDictionary *EvoluDeviceSecretItem(NSString *appName)
{
  NSString *service = [@"dev.evolu.deviceSecret/"
      stringByAppendingString:NSBundle.mainBundle.bundleIdentifier ?: @""];
  return @{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService : service,
    (__bridge id)kSecAttrAccount : appName,
  };
}

// Reads the DeviceSecret `item` names into `stored`.
static OSStatus EvoluCopyDeviceSecret(NSDictionary *item, NSString **stored)
{
  NSMutableDictionary *query = [item mutableCopy];
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  CFTypeRef data = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &data);
  if (status == errSecSuccess)
    *stored = [[NSString alloc] initWithData:(__bridge_transfer NSData *)data
                                    encoding:NSUTF8StringEncoding];
  return status;
}

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

// One Keychain item per app, a generic password that Evolu's service with the
// app's bundle identifier and the app's name identify. It's readable after the
// device's first unlock, so a sync in the background can open the device
// database, and it never syncs to iCloud or moves to another device, as
// Android's Keystore keys don't. iOS keeps the Keychain items of a removed app,
// so it survives a reinstall. The TurboModule manager's queue runs one React
// instance's calls in turn, but a reload starts another instance with a queue
// of its own, so two calls can race. The Keychain adds an item atomically, and
// the call that finds a duplicate reads the stored secret again, never
// replacing it: the device database opens only with the stored secret.
- (void)getOrAddDeviceSecret:(NSString *)appName
                      secret:(NSString *)secret
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  NSDictionary *item = EvoluDeviceSecretItem(appName);
  NSString *stored = nil;
  OSStatus status = EvoluCopyDeviceSecret(item, &stored);
  // The Keychain also reports an item it can't decrypt as missing, and deletes
  // it, so a new secret replaces a corrupt one, and the device database the old
  // secret opened can't be opened again. See
  // https://github.com/apple-oss-distributions/Security/blob/db15acbe6a7f257a859ad9a3bb86097bfe0679d9/secdxctests/KeychainCryptoTests.m#L417-L457
  if (status == errSecItemNotFound) {
    NSMutableDictionary *attributes = [item mutableCopy];
    attributes[(__bridge id)kSecValueData] = [secret dataUsingEncoding:NSUTF8StringEncoding];
    attributes[(__bridge id)kSecAttrAccessible] =
        (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
    status = SecItemAdd((__bridge CFDictionaryRef)attributes, NULL);
    if (status == errSecSuccess) {
      resolve(secret);
      return;
    }
    if (status == errSecDuplicateItem) status = EvoluCopyDeviceSecret(item, &stored);
  }
  if (status == errSecSuccess && stored != nil) {
    resolve(stored);
  } else if (status == errSecInteractionNotAllowed) {
    reject(@"Unavailable", @"The Keychain can't be read before the device's first unlock.", nil);
  } else if (status == errSecSuccess) {
    reject(@"Keychain", @"The Keychain holds a DeviceSecret that isn't UTF-8.", nil);
  } else {
    reject(@"Keychain",
           [NSString stringWithFormat:@"The Keychain failed with status %d.", (int)status],
           nil);
  }
}

// Deletes the app's Keychain item, if any, so the next get-or-add stores a new
// secret. The Keychain itself never leaves an item it can't read, so Evolu
// offers no start over on iOS, but the method is the spec's on both platforms.
- (void)forgetDeviceSecret:(NSString *)appName
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)EvoluDeviceSecretItem(appName));
  if (status == errSecSuccess || status == errSecItemNotFound) {
    resolve(nil);
  } else {
    reject(@"Keychain",
           [NSString stringWithFormat:@"The Keychain failed with status %d.", (int)status],
           nil);
  }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeEvoluAppSpecJSI>(params);
}

@end
