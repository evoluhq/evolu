# Builds Evolu's native code for iOS: the C++ TurboModule and JSI adapter in
# cpp/, the ObjC++ classes in ios/, and the C in native/units, the wrapper units
# that rename SQLite, the core, BearSSL and Monocypher to evolu_ names before
# they compile native/c. The flags come from native.json, as the vendor step
# recorded them, plus the C subspec's -w and -fno-lto below, and native/ must be
# the tree the vendor step wrote from it.
require "digest"
require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
manifest_text = File.read(File.join(__dir__, "native.json"))
flags = JSON.parse(manifest_text)["flags"]

digest_file = File.join(__dir__, "native", "native.json.sha256")
unless File.exist?(digest_file) &&
       File.read(digest_file) == "#{Digest::SHA256.hexdigest(manifest_text)}\n"
  raise "@evolu/react-native's native/ is missing or wasn't written from its native.json. " \
        "In Evolu's repository, run node packages/react-native/scripts/vendor-native.mts."
end

# Xcode sets the C standard pod-wide, so it's the one flag of native.json's iOS
# C flags.
standard = flags["ios"]["c"].map { |flag| flag[/\A-std=(.+)\z/, 1] }
unless standard.length == 1 && standard[0]
  raise "@evolu/react-native's native.json has iOS C flags other than -std: #{flags["ios"]["c"].join(" ")}"
end

Pod::Spec.new do |s|
  s.name = "EvoluReactNative"
  s.version = package["version"]
  s.summary = package["description"]
  s.homepage = package["homepage"]
  s.license = package["license"]
  s.authors = package["author"]
  # React Native's minimum.
  s.platforms = { :ios => "15.1" }
  s.source = { :git => "https://github.com/evoluhq/evolu.git", :tag => s.version.to_s }

  s.source_files = ["cpp/*.{h,cpp}", "ios/*.{h,mm}"]
  # So no Evolu header, such as SQLite's, lands in Pods/Headers/Public.
  s.private_header_files = ["cpp/*.h", "ios/*.h"]
  # Only the wrapper units compile, so nothing compiles native/c unrenamed.
  s.preserve_paths = ["native/c/*", "native/include/*"]
  s.resource_bundles = { "EvoluReactNative_privacy" => ["ios/PrivacyInfo.xcprivacy"] }

  # Xcode compiles with Clang modules, under which -std=c11 hides memset_s from
  # evolu_crypto.c, so the C standard is native.json's gnu11. RN_STRICT_API
  # reaches every unit, and those that include React Native's headers include
  # its umbrella headers first.
  s.pod_target_xcconfig = {
    "GCC_C_LANGUAGE_STANDARD" => standard[0],
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) #{flags["defines"].join(" ")} RN_STRICT_API=1",
    "HEADER_SEARCH_PATHS" => "$(inherited) \"$(PODS_TARGET_SRCROOT)/#{flags["headerSearchPath"]}\"",
  }

  # CocoaPods gives a subspec's compiler_flags to its files alone, so the C
  # compiles optimized in Debug builds too, while React Native's units keep the
  # app's settings. -w silences Xcode's default warnings, which flag about 260
  # places in SQLite and BearSSL, code Evolu doesn't change. Only the podspec
  # has it: the cross-compile reads native.json, so it still compiles the core
  # and the binding layer with -Wall -Wextra -Werror. -fno-lto, as on Android,
  # keeps an app that turns LTO on for its pods from inlining the constant-time
  # C across files.
  s.subspec "C" do |c|
    c.source_files = "native/units/*.c"
    c.compiler_flags = (flags["c"] + ["-w", "-fno-lto"]).join(" ")
  end

  install_modules_dependencies(s)
end
