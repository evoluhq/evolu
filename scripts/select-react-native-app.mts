/**
 * Selects the React Native app jobs of
 * `.github/workflows/react-native-app.yaml` for a CI run, from the files it
 * changes against its base: a pull request's, or a merge-queue run's
 * `merge_group.base_sha`. It fetches the base first, because the checkout is
 * shallow.
 *
 * - The app jobs of the Expo example run when a file is under
 *   `packages/react-native/`, the core's `src`, `binding`, `vendor` or
 *   `scripts`, or `examples/react-expo/`, or is `pnpm-lock.yaml`, which a React
 *   Native or Expo update changes.
 * - The jobs of the example without Expo run too when a file is under
 *   `examples/react-native/` or `packages/react-native/android/`, which only
 *   that example's Android job builds with Gradle's configuration cache, or is
 *   the app workflow, which defines them, or what React Native CLI's
 *   autolinking reads: `react-native.config.js` or the podspec. The examples
 *   differ only in autolinking, entry files and the Android build's
 *   configuration cache.
 * - A renamed file counts under both its old and its new path.
 * - A missing, all-zero or unfetchable base selects every job, and so does a
 *   `workflow_dispatch` run, as for a branch.
 * - A change elsewhere, such as to `@evolu/common`, whose Evolu the device suites
 *   also run on Hermes, selects none; it shows up at the nightly run at the
 *   latest, and the release waits for it.
 *
 * Usage: `node scripts/select-react-native-app.mts --event=<event name>
 * --base=<base commit>` appends `app-jobs` and `without-expo`, each `true` or
 * `false`, to `$GITHUB_OUTPUT`, or prints them.
 *
 * @module
 */
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

/**
 * Which app jobs a CI run needs: none, the Expo example's, or also those of the
 * example without Expo.
 */
export type ReactNativeAppJobs = "none" | "expo" | "all";

const expoPaths = [
  "packages/react-native/",
  "packages/sqlite-core/src/",
  "packages/sqlite-core/binding/",
  "packages/sqlite-core/vendor/",
  "packages/sqlite-core/scripts/",
  "examples/react-expo/",
  "pnpm-lock.yaml",
];

const withoutExpoPaths = [
  ".github/workflows/react-native-app.yaml",
  "examples/react-native/",
  "packages/react-native/react-native.config.js",
  "packages/react-native/EvoluReactNative.podspec",
  "packages/react-native/android/",
];

/**
 * Selects the app jobs for a run of the event `event` against `base`, in the
 * checkout `cwd`.
 */
export const selectReactNativeAppJobs = ({
  event,
  base,
  cwd,
}: {
  event: string;
  base: string;
  cwd: string;
}): ReactNativeAppJobs => {
  if (
    event === "workflow_dispatch" ||
    !/^[0-9a-f]{40}$/u.test(base) ||
    /^0+$/u.test(base)
  )
    return "all";
  const fetched = spawnSync(
    "git",
    ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", base],
    { cwd },
  );
  if (fetched.status !== 0) return "all";
  // -z lists names raw, which git otherwise quotes when they aren't ASCII.
  const diff = execFileSync(
    "git",
    ["diff", "-z", "--no-renames", "--name-only", base, "HEAD"],
    {
      cwd,
      encoding: "utf8",
    },
  );
  const files = diff.split("\0").filter((file) => file !== "");
  const matches = (paths: ReadonlyArray<string>) =>
    files.some((file) =>
      paths.some((path) =>
        path.endsWith("/") ? file.startsWith(path) : file === path,
      ),
    );
  if (matches(withoutExpoPaths)) return "all";
  return matches(expoPaths) ? "expo" : "none";
};

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      event: { type: "string", default: "" },
      base: { type: "string", default: "" },
    },
  });
  const jobs = selectReactNativeAppJobs({
    event: values.event,
    base: values.base,
    cwd: process.cwd(),
  });
  const output = `app-jobs=${jobs !== "none"}\nwithout-expo=${jobs === "all"}\n`;
  const { GITHUB_OUTPUT } = process.env;
  if (GITHUB_OUTPUT == null) process.stdout.write(output);
  else appendFileSync(GITHUB_OUTPUT, output);
}
