import { assertEqual } from "@evolu/common";
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
});
