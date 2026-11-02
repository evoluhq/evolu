# App size

This suite records how big the Release builds of Evolu's example apps are, on
iOS and Android, with and without Expo, and how each change moves them. It
records absolute sizes of the parts we can optimize, measured the same way
every time, in [`baselines.json`](./baselines.json), whose git history is the
size history. App Store and Google Play download sizes are not its goal: they
need signed device archives or app bundles and add little to optimizing.

Only CI measures, in the React Native app jobs of
[`react-native-app.yaml`](../../.github/workflows/react-native-app.yaml), so
the suite has no `pnpm bench:app-size` and no modes. It reports and never
fails a job.

## Prerequisites

The app jobs' builds: Xcode 26.6, which the workflow pins, and NDK
27.1.12297006, which the examples' Gradle builds and React Native pin. The
runner image, which GitHub updates weekly, provides the rest, such as
CocoaPods, the JDK and CMake.

## Workload

| Key            | App job                                 | Build                                     |
| -------------- | --------------------------------------- | ----------------------------------------- |
| `expo-ios`     | React Native iOS app (Expo)             | `examples/react-expo`, simulator, arm64   |
| `expo-android` | React Native Android app (Expo)         | `examples/react-expo`, APK                |
| `cli-ios`      | React Native iOS app (without Expo)     | `examples/react-native`, static libraries |
| `cli-android`  | React Native Android app (without Expo) | `examples/react-native`, APK              |

The static-frameworks build of `examples/react-native` is not measured: the
default static-library build represents the app's size. Neither are the
nightly run's macos-latest jobs, whose Xcode isn't the pinned one.

The iOS builds add `DEPLOYMENT_POSTPROCESSING=YES` and
`LD_GENERATE_MAP_FILE=YES`. A plain `xcodebuild build` runs with
`DEPLOYMENT_POSTPROCESSING = NO`, so `STRIP_INSTALLED_PRODUCT` and
`STRIP_STYLE = all` never apply, while an `archive` turns post-processing on.
Measured locally on the Expo example, a plain build's executable was 11.26 MB,
the simulator build's with `DEPLOYMENT_POSTPROCESSING=YES` 5.46 MB, and an
unsigned device archive's 5.47 MB; the whole `.app` was 42.70, 36.91 and 36.68
MB. On `examples/react-native`, the simulator build's executable was 1.25 MB
and the archive's 1.21 MB, and the whole `.app` 24.37 and 24.21 MB. So the
simulator build's `.app` matches what an archive ships within 1%, and its
executable within 3%.

The Android builds build `x86_64,arm64-v8a`: the emulator runs the x86_64
libraries, and the arm64-v8a ones, which most phones get, are measured.

## Metrics

All values are bytes of files as they sit on disk or, inside the APK,
uncompressed. Parts are subsets of their container and never add up to its
total. Keys of nested values are file names, except the three groups of
`executableByLibrary`.

iOS, from the `.app` and the link map:

- `app`: every file in the `.app`.
- `executable`: the app's executable.
- `executableByLibrary`: the link map's live symbol sizes summed per static
  library (`libEvoluReactNative.a`, `libRNReanimated.a`, ...), and three
  groups: `app`, the app target's files, everything under the target's `.build`
  directory; `linkerSynthesized`; and `stubs`, every other file, which are
  `.tbd` and `.dylib` files and framework binaries. Symbols in the zero-fill
  sections `__bss`, `__common` and `__thread_bss`, which take no space in the
  file, and dead-stripped symbols are excluded. Headers, the symbol table and
  the signature count in no group.
- `frameworks`: each embedded framework's binary.
- `jsBundle`: `main.jsbundle`.
- `evolu`: `libEvoluReactNative.a` plus the code React Native generated for
  it, `libReactCodegen.a(EvoluReactNativeSpec-generated.o)`.

Android, from the APK's zip central directory:

- `apk`: the APK file, with both ABIs.
- `libs`: each `lib/arm64-v8a/*.so`.
- `dex`: every `classes*.dex`.
- `jsBundle`: `assets/index.android.bundle`.
- `assets`: the rest of `assets/`.
- `resources`: `resources.arsc` and `res/`.

Android has no `evolu`. `examples/react-native` has no other native module, so
its `libappmodules.so` is Evolu's core and adapter plus autolinking glue and
stands in for Evolu's Android share; the Expo app's also holds Reanimated's and
Worklets' generated code. `evolu` on iOS measures the same C exactly.

The prebuilt frameworks of React Native and Expo keep their local symbols even
in an archive: `strip -S -x` took React from 11.9 to 6.3 MB, hermesvm from 6.4
to 3.0 MB and ExpoModulesCore from 4.0 to 2.1 MB.

## Baselines

[`baselines.json`](./baselines.json) holds one entry per key, which also
records `image`, the runner image the entry was measured on, from the runner's
`ImageOS` and `ImageVersion`. A new image can change sizes without a change to
the repository, so the summary shows the image next to the baseline's, but
never compares them.

[`measure.mts`](./measure.mts) compares each value with the key's baseline,
writes a table of baselines, values and differences to the job summary, and
adds a warning annotation when a value differs or the key has no entry. It has
no threshold and fails no job: a failure would block a release, and app jobs
run only for the paths `scripts/select-react-native-app.mts` lists, so a
change to `packages/common` moves the JS bundle without running them, and the
next pull request that runs them would fail for it. Each job uploads its entry
as the artifact `app-size-<key>`.

## Updating the baselines

A pull request that moves sizes on purpose updates the baselines itself;
otherwise they are updated from a release run, which runs every app job. A
pull request's own run may run only the Expo pair, or none for a change such
as to `packages/common`, so dispatch CI on its branch, which runs every app
job:

```sh
gh workflow run ci.yaml --ref <branch>
```

When it has finished, rebuild the file from that run's four entries. The
download goes to a new directory, since `gh run download` keeps files already
there, and `jq` refuses a run that lacks an entry, as when a size step failed
without failing its job:

```sh
size_dir=$(mktemp -d) &&
  gh run download <run> -p 'app-size-*' -D "$size_dir" &&
  jq -s -e '
    add |
    if keys == ["cli-android", "cli-ios", "expo-android", "expo-ios"]
    then .
    else error("Expected all four app-size entries")
    end
  ' "$size_dir"/app-size-*/*.json > "$size_dir/baselines.json" &&
  cp "$size_dir/baselines.json" bench/app-size/baselines.json &&
  pnpm exec prettier --write bench/app-size/baselines.json
```

A change to `bench/app-size/` runs every app job, so the commit that updates
the baselines shows whether they match.

## Measuring a local build

Build as the app job's Build step does, then pass the `.app` and its link map,
or the APK, and write the comparison to the terminal:

```sh
node bench/app-size/measure.mts --key=expo-ios --image=local \
  --app=examples/react-expo/ios/build/Build/Products/Release-iphonesimulator/expoapp.app \
  --link-map=examples/react-expo/ios/build/Build/Intermediates.noindex/expoapp.build/Release-iphonesimulator/expoapp.build/expoapp-LinkMap-normal-arm64.txt \
  --out="$(mktemp -d)" --summary=/dev/stdout
```

A local Xcode or NDK other than the pinned one gives other sizes.
