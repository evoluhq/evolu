import { assertEqual, assertTrue } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const files = readdirSync(new URL(".github", root), {
  encoding: "utf8",
  recursive: true,
})
  .filter((file) => /\.ya?ml$/u.test(file))
  .map((file) => ({
    file,
    text: readFileSync(new URL(`.github/${file}`, root), "utf8"),
  }));

/** Lists the `file:line` of each step that uses `action` without `setting`. */
const stepsWithout = (action: string, setting: string) =>
  files.flatMap(({ file, text }) => {
    // Each step but the first chunk starts with the newline before its dash.
    let line = 1;
    return text.split(/(?=\n *- )/u).flatMap((step) => {
      const stepLine = line + 1;
      line += step.split("\n").length - 1;
      const usesAction = ["", '"', "'"].some((quote) =>
        step.includes(`uses: ${quote}${action}@`),
      );
      const hasSetting = step.split("\n").some((l) => l.trim() === setting);
      return usesAction && !hasSetting ? [`${file}:${stepLine}`] : [];
    });
  });

/** The text of a workflow under `.github/workflows/`. */
const workflow = (name: string): string =>
  files.find(({ file }) => file === `workflows/${name}`)?.text ?? "";

/** The lines of a workflow's job `name` after its first, each after a newline. */
const job = (text: string, name: string): string =>
  new RegExp(`\\n  ${name}:((?:\\n    .*|\\n)*)`, "u").exec(text)?.[1] ?? "";

/** Splits a workflow into its steps, as `stepsWithout` does. */
const splitSteps = (text: string): ReadonlyArray<string> =>
  text.split(/(?=\n *- )/u);

describe("GitHub workflows", () => {
  // Otherwise the checkout leaves the job's token on the runner for later git
  // commands, and any code the job runs, such as an install script, can read
  // it.
  it("check out without persisting credentials", () => {
    assertEqual(
      stepsWithout("actions/checkout", "persist-credentials: false"),
      [],
    );
  });

  // Jobs on main that run dependency code can write the Actions cache, so a
  // setup that restores an image or a binary from it would run what they
  // wrote.
  it("set up QEMU and Buildx without the Actions cache", () => {
    assertEqual(
      [
        ...stepsWithout("docker/setup-qemu-action", "cache-image: false"),
        ...stepsWithout("docker/setup-buildx-action", "cache-binary: false"),
      ],
      [],
    );
  });

  it("declare top-level permissions", () => {
    assertEqual(
      files
        .filter(
          ({ file, text }) =>
            file.startsWith("workflows/") && !/^permissions:/mu.test(text),
        )
        .map(({ file }) => file),
      [],
    );
  });

  // As for the NDK in checks.yaml: jobs on main that run dependency code can
  // write the Actions cache, and nothing would verify restored Pods, Gradle
  // caches or compiler caches. Every use verifies the source archives against
  // their pins.
  it("cache only the source archives in the React Native app jobs", () => {
    const keys = splitSteps(workflow("react-native-app.yaml"))
      .filter((step) => step.includes("uses: actions/cache@"))
      .map((step) => /\n *key: ([\w-]+?)-\$\{\{/u.exec(step)?.[1]);

    assertTrue(keys.length > 0);
    assertEqual(
      keys.filter((key) => key !== "sqlite-core-sources"),
      [],
    );
  });

  // Every app job builds what it runs from the source or from pnpm's store,
  // which the repository's setup action restores for every job, so the jobs
  // use only actions that restore nothing else. Uploading an artifact, at
  // checks.yaml's pin, restores nothing.
  it("use only checkout, the cache, the repository's setup action and the artifact upload in the React Native app jobs", () => {
    const actions = [
      ...workflow("react-native-app.yaml").matchAll(/\buses: (\S+)/gmu),
    ].map(([, action]) => action);

    assertTrue(actions.length > 0);
    assertEqual(
      actions.filter(
        (action) =>
          !action.startsWith("actions/checkout@") &&
          !action.startsWith("actions/cache@") &&
          action !== "./.github/actions/setup-node-pnpm-install" &&
          action !==
            "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
      ),
      [],
    );
  });

  // The first CI runs' iOS jobs never saw the app start, and no log said why.
  it("upload the simulator's screenshot after failed device tests in the iOS app jobs", () => {
    const text = workflow("react-native-app.yaml");
    const names = ["react-native-ios-app", "react-native-cli-ios-app"];

    assertEqual(
      names.filter((name) => {
        const steps = splitSteps(job(text, name));
        const deviceTests = steps.findIndex((step) =>
          step.includes("- name: Device tests\n"),
        );
        const later = steps.slice(deviceTests + 1);
        const screenshot = later.findIndex(
          (step) =>
            step.includes("\n        if: failure()\n") &&
            step.includes('xcrun simctl io "$UDID" screenshot'),
        );
        const upload = later.findIndex(
          (step) =>
            step.includes("\n        if: failure()\n") &&
            step.includes("uses: actions/upload-artifact@"),
        );
        return !(deviceTests >= 0 && screenshot >= 0 && upload > screenshot);
      }),
      [],
    );
  });

  // Without it, a failed or skipped job it needs would skip it, which a
  // required check counts as passing.
  it("run the ci job whatever the jobs it needs ended with", () => {
    assertTrue(job(workflow("ci.yaml"), "ci").includes("\n    if: always()\n"));
  });

  // The first CI run's Android jobs started an emulator that found no AVD,
  // since avdmanager had written it elsewhere, and had no adb on the PATH.
  it("start the emulator from the AVD it lists, with adb on the PATH, in the Android app jobs", () => {
    const text = workflow("react-native-app.yaml");
    const names = ["react-native-android-app", "react-native-cli-android-app"];

    assertEqual(
      names.map((name) => {
        const androidJob = job(text, name);
        const avdHome = androidJob.indexOf("ANDROID_AVD_HOME=");
        const listed = androidJob.indexOf("emulator -list-avds");
        return [
          name,
          avdHome >= 0 && avdHome < androidJob.indexOf("avdmanager create avd"),
          /sdkmanager --install [^\n]*\bplatform-tools\b/u.test(androidJob),
          androidJob.includes(
            'echo "$ANDROID_HOME/platform-tools" >> "$GITHUB_PATH"',
          ),
          listed >= 0 && listed < androidJob.indexOf("emulator -avd evolu"),
        ];
      }),
      names.map((name) => [name, true, true, true, true]),
    );
  });

  // The first CI run's iOS jobs printed only that the app died.
  it("print diagnostics after failed device tests in every React Native app job", () => {
    const text = workflow("react-native-app.yaml");
    const names = [
      ...text.slice(text.indexOf("\njobs:\n")).matchAll(/^  ([\w-]+):$/gmu),
    ].map(([, name]) => name);

    assertEqual(names.length, 4);
    assertEqual(
      names.filter((name) => {
        const steps = splitSteps(job(text, name));
        const deviceTests = steps.findIndex((step) =>
          step.includes("- name: Device tests\n"),
        );
        return !(
          deviceTests >= 0 &&
          steps
            .slice(deviceTests + 1)
            .some((step) => step.includes("\n        if: failure()\n"))
        );
      }),
      [],
    );
  });

  // A failed app job must fail CI; only a selection that needs none skips
  // them.
  it("accept skipped React Native app jobs in the ci job only when the selection needs none", () => {
    const step =
      splitSteps(workflow("ci.yaml")).find((step) =>
        step.includes("- name: Require successful checks\n"),
      ) ?? "";
    const script = /\n( *)run: \|\n((?:\1 .*\n?)*)/u.exec(step)?.[2] ?? "";
    const passes = (env: Record<string, string>) =>
      spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", "-c", script],
        {
          env: { PATH: process.env.PATH, ...env },
        },
      ).status === 0;
    const results = (
      appJobs: string,
      appResult: string,
      selectResult = "success",
    ) => ({
      CHECKS_RESULT: "success",
      SELECT_RESULT: selectResult,
      APP_JOBS: appJobs,
      APP_RESULT: appResult,
    });

    assertEqual(
      [
        passes(results("true", "success")),
        passes(results("false", "skipped")),
        passes(results("true", "skipped")),
        passes(results("true", "failure")),
        passes(results("true", "cancelled")),
        passes(results("", "skipped", "failure")),
        passes({ ...results("true", "success"), CHECKS_RESULT: "failure" }),
      ],
      [true, true, false, false, false, false, false],
    );
  });

  // The packages publish only when every app job passed on the commit.
  it("pack the release only after every React Native app job passed", () => {
    const release = workflow("release.yaml");
    const pack = job(release, "pack");
    const appJobs = job(release, "react-native-app");

    assertTrue(/\n    needs: \[[^\]]*\breact-native-app\b/u.test(pack));
    // A status function would run it after their failure.
    assertEqual(/\b(?:always|cancelled|failure)\(\)/u.test(pack), false);
    assertTrue(appJobs.includes("\n      without-expo: true\n"));
    assertTrue(appJobs.includes("\n      static-frameworks: true\n"));
  });

  // A fork's schedule would spend its owner's macOS minutes.
  it("run every React Native app job nightly, only in evoluhq/evolu", () => {
    const text = workflow("react-native-nightly.yaml");
    const jobs = [
      ...text.slice(text.indexOf("\njobs:\n")).matchAll(/^  ([\w-]+):$/gmu),
    ].map(([, name]) => name);

    assertTrue(jobs.length > 0);
    assertEqual(
      jobs.filter(
        (name) =>
          !job(text, name).includes(
            "\n    if: github.repository == 'evoluhq/evolu'\n",
          ),
      ),
      [],
    );
    // Every app job, and on the newest image every one that isn't Android's.
    const appJobs = job(text, "react-native-app");
    assertTrue(appJobs.includes("\n      without-expo: true\n"));
    assertTrue(appJobs.includes("\n      static-frameworks: true\n"));
    assertTrue(
      job(text, "react-native-app-latest").includes(
        "\n      without-expo: true\n",
      ),
    );
  });

  // The website deploy job holds the Cloudflare token, and its npm ci, like
  // any npm install there, reads these settings from the folder's .npmrc.
  it("install Wrangler without install scripts or new versions", () => {
    const npmrc = readFileSync(
      new URL("apps/web/deploy/.npmrc", root),
      "utf8",
    ).split("\n");
    assertEqual(
      ["min-release-age=1", "ignore-scripts=true"].filter(
        (setting) => !npmrc.includes(setting),
      ),
      [],
    );
  });

  // The musl addons @evolu/nodejs ships are built and checked in the image the
  // relay runs on, so a Dependabot update of one must update the other.
  it("build the musl SQLite addons in the relay image's base image, by its digest", () => {
    const base = /^FROM (\S+)$/mu.exec(
      readFileSync(new URL("apps/relay/Dockerfile", root), "utf8"),
    )?.[1];
    const images = [
      ...job(workflow("checks.yaml"), "nodejs-native-linux").matchAll(
        /image=(\S*alpine\S*)$/gmu,
      ),
    ].map((match) => match[1]);

    assertTrue(base?.includes("@sha256:") === true);
    assertEqual(images, [base]);
  });
});
