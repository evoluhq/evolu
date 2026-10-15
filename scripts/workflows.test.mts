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

describe("GitHub workflows", () => {
  // Otherwise the checkout leaves the job's token on the runner for later git
  // commands, and any code the job runs, such as an install script, can read
  // it.
  it("check out without persisting credentials", () => {
    assertEqual(
      files.flatMap(({ file, text }) => {
        // Each step but the first chunk starts with the newline before its
        // dash.
        let line = 1;
        return text.split(/(?=\n *- )/u).flatMap((step) => {
          const stepLine = line + 1;
          line += step.split("\n").length - 1;
          return /\n *(?:- )?uses: actions\/checkout@/u.test(step) &&
            !/\n +persist-credentials: false\n/u.test(`${step}\n`)
            ? [`${file}:${stepLine}`]
            : [];
        });
      }),
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
