/**
 * `EvoluReactNative.podspec`, loaded by Ruby with CocoaPods' classes stubbed,
 * as CocoaPods evaluates it, so any host with Ruby checks what it gives Xcode:
 * the flags native.json records, and its refusal of a native/ that the vendor
 * step didn't write from that native.json. A podspec is Ruby, so a value can be
 * of the wrong type and still load, as react-native-nitro-sqlite's once
 * compared the integer 1 with the string "1"
 * (margelo/react-native-nitro-sqlite#312).
 */
import { assertEqual } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { NativeManifest } from "../../scripts/vendor-native.mts";

const packageDirectory = fileURLToPath(new URL("../../", import.meta.url));
const manifestText = readFileSync(join(packageDirectory, "native.json"));
const manifest = JSON.parse(manifestText.toString("utf8")) as NativeManifest;

/**
 * CocoaPods' `Pod::Spec` and React Native's `install_modules_dependencies`,
 * recording what the podspec sets, printed as JSON.
 */
const prelude = `
require "json"

class SpecRecorder
  attr_reader :attributes

  def initialize
    @attributes = {}
  end

  def subspec(name)
    subspec = SpecRecorder.new
    yield subspec
    (@attributes["subspecs"] ||= {})[name] = subspec.attributes
  end

  def method_missing(name, *arguments)
    attribute = name.to_s
    if attribute.end_with?("=")
      @attributes[attribute.chomp("=")] = arguments.first
    elsif @attributes.key?(attribute)
      @attributes[attribute]
    else
      super
    end
  end

  def respond_to_missing?(name, include_private = false)
    name.to_s.end_with?("=") || @attributes.key?(name.to_s) || super
  end
end

module Pod
  class Spec
    def self.new
      spec = SpecRecorder.new
      yield spec
      $recorded = spec.attributes
    end
  end
end

def install_modules_dependencies(spec)
  spec.attributes["install_modules_dependencies"] = true
end

begin
  load ARGV.fetch(0)
rescue => error
  warn error.message
  exit 1
end
puts JSON.generate($recorded)
`;

/**
 * Copies the podspec, package.json and native.json into a package of their own
 * and gives it a native/ with `digest`, or none.
 */
const setupPackage = (t: TestContext, digest: string | null): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-podspec-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  for (const file of [
    "EvoluReactNative.podspec",
    "package.json",
    "native.json",
  ])
    copyFileSync(join(packageDirectory, file), join(directory, file));
  if (digest != null) {
    mkdirSync(join(directory, "native"));
    writeFileSync(join(directory, "native/native.json.sha256"), digest);
  }
  return directory;
};

const loadPodspec = (directory: string) =>
  spawnSync(
    "ruby",
    ["-e", prelude, join(directory, "EvoluReactNative.podspec")],
    { encoding: "utf8" },
  );

const manifestDigest = `${createHash("sha256").update(manifestText).digest("hex")}\n`;

const refusal =
  "@evolu/react-native's native/ is missing or wasn't written from its native.json. In Evolu's repository, run node packages/react-native/scripts/vendor-native.mts.\n";

test("gives Xcode native.json's defines, header search path and C flags, the C at -O2 in a subspec of its own, and every native header private", (t) => {
  const loaded = loadPodspec(setupPackage(t, manifestDigest));
  assertEqual([loaded.status, loaded.stderr], [0, ""]);
  const spec = JSON.parse(loaded.stdout) as Record<string, unknown>;
  const { version } = JSON.parse(
    readFileSync(join(packageDirectory, "package.json"), "utf8"),
  ) as { readonly version: string };

  assertEqual(manifest.flags.ios.c, ["-std=gnu11"]);
  assertEqual(spec, {
    name: "EvoluReactNative",
    version,
    summary: "Evolu for React Native and Expo",
    homepage: "https://evolu.dev",
    license: "MIT",
    authors: "Daniel Steigerwald <daniel@steigerwald.cz>",
    platforms: { ios: "15.1" },
    source: { git: "https://github.com/evoluhq/evolu.git", tag: version },
    source_files: ["cpp/*.{h,cpp}", "ios/*.{h,mm}"],
    private_header_files: ["cpp/*.h", "ios/*.h"],
    preserve_paths: ["native/c/*", "native/include/*"],
    resource_bundles: {
      EvoluReactNative_privacy: ["ios/PrivacyInfo.xcprivacy"],
    },
    pod_target_xcconfig: {
      GCC_C_LANGUAGE_STANDARD: "gnu11",
      CLANG_CXX_LANGUAGE_STANDARD: "c++20",
      GCC_PREPROCESSOR_DEFINITIONS: `$(inherited) ${manifest.flags.defines.join(" ")} RN_STRICT_API=1`,
      HEADER_SEARCH_PATHS: `$(inherited) "$(PODS_TARGET_SRCROOT)/${manifest.flags.headerSearchPath}"`,
    },
    subspecs: {
      C: {
        source_files: "native/units/*.c",
        compiler_flags: [...manifest.flags.c, "-w", "-fno-lto"].join(" "),
      },
    },
    install_modules_dependencies: true,
  });
  assertEqual(manifest.flags.c, ["-O2"]);
  assertEqual(manifest.flags.headerSearchPath, "native/include");
});

test("refuses a native.json whose iOS C flags hold more than the C standard, which Xcode would drop", (t) => {
  const directory = setupPackage(t, null);
  const changed = JSON.parse(manifestText.toString("utf8")) as NativeManifest;
  const text = `${JSON.stringify({
    ...changed,
    flags: {
      ...changed.flags,
      ios: { ...changed.flags.ios, c: ["-std=gnu11", "-fno-common"] },
    },
  })}\n`;
  writeFileSync(join(directory, "native.json"), text);
  mkdirSync(join(directory, "native"));
  writeFileSync(
    join(directory, "native/native.json.sha256"),
    `${createHash("sha256").update(text).digest("hex")}\n`,
  );

  const loaded = loadPodspec(directory);

  assertEqual(
    [loaded.status, loaded.stdout, loaded.stderr],
    [
      1,
      "",
      "@evolu/react-native's native.json has iOS C flags other than -std: -std=gnu11 -fno-common\n",
    ],
  );
});

test("refuses a package without native/, naming the vendor step", (t) => {
  const loaded = loadPodspec(setupPackage(t, null));

  assertEqual([loaded.status, loaded.stdout, loaded.stderr], [1, "", refusal]);
});

test("refuses a native/ written from another native.json, or not matching it, which has no digest", (t) => {
  for (const digest of [`${"0".repeat(64)}\n`, ""]) {
    const loaded = loadPodspec(setupPackage(t, digest));

    assertEqual(
      [loaded.status, loaded.stdout, loaded.stderr],
      [1, "", refusal],
    );
  }
});
