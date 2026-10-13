import { assertEqual } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const adrDirectory = new URL("docs/adr/", root);
const markdownFiles = readdirSync(adrDirectory)
  .filter((file) => file.endsWith(".md"))
  .toSorted();
const records = markdownFiles
  .filter((file) => file !== "README.md" && file !== "template.md")
  .map((file) => ({
    file,
    lines: readFileSync(new URL(file, adrDirectory), "utf8").split("\n"),
  }));
const statusByFile = new Map(
  records.map(({ file, lines }) => [file, lines[3] ?? ""]),
);
const grep = spawnSync(
  "git",
  ["grep", "--untracked", "-I", "-o", "-E", "docs/adr/[0-9A-Za-z_.-]+\\.md"],
  { cwd: root, encoding: "utf8" },
);
// git grep exits with 1 when nothing matches.
if (grep.status !== 0 && grep.status !== 1)
  throw new Error(`git grep failed: ${grep.stderr}`);
const references = grep.stdout
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => {
    const separator = line.indexOf(":");
    return {
      file: line.slice(0, separator),
      target: line.slice(separator + 1),
    };
  });

describe("docs/adr", () => {
  it("names records with a lowercase slug that starts with a letter", () => {
    assertEqual(
      records
        .map(({ file }) => file)
        .filter((file) => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.md$/u.test(file)),
      [],
    );
  });

  it("follows the template", () => {
    const sections = [
      "## Context",
      "## Decision",
      "## Rejected alternatives",
      "## Consequences",
    ];
    const problems = records.flatMap(({ file, lines }) => {
      const supersededBy =
        /^- Status: Superseded by \[[^\]]+\]\(([a-z0-9-]+\.md)\)$/u.exec(
          lines[3] ?? "",
        )?.[1];
      return [
        ...(/^# [A-Z]/u.test(lines[0])
          ? []
          : [
              `${file}: line 1 must be "# " followed by a title that starts with a capital letter and states the decision`,
            ]),
        ...(/^- Date: \d{4}-\d{2}-\d{2}$/u.test(lines[2] ?? "")
          ? []
          : [`${file}: line 3 must be "- Date: YYYY-MM-DD"`]),
        ...(/^- Status: (?:Proposed|Accepted|Rejected)$/u.test(
          lines[3] ?? "",
        ) ||
        (supersededBy != null &&
          supersededBy !== file &&
          /^- Status: (?:Accepted|Superseded by )/u.test(
            statusByFile.get(supersededBy) ?? "",
          ))
          ? []
          : [
              `${file}: line 4 must be "- Status: " followed by Proposed, Accepted, Rejected, or "Superseded by [Title](slug.md)" linking another accepted or superseded record`,
            ]),
        ...(lines.filter((line) => line.startsWith("## ")).join("\n") ===
        sections.join("\n")
          ? []
          : [`${file}: the sections must be ${sections.join(", ")}`]),
      ];
    });
    assertEqual(problems, []);
  });

  it("resolves links in records", () => {
    const brokenLinks = markdownFiles.flatMap((file) =>
      [
        ...readFileSync(new URL(file, adrDirectory), "utf8").matchAll(
          /\]\(([^)\s]+)\)/gu,
        ),
      ]
        .map((match) => match[1].split("#")[0])
        .filter(
          (target) =>
            target !== "" &&
            !/^[a-z]+:/u.test(target) &&
            !existsSync(new URL(target, adrDirectory)),
        )
        .map((target) => `${file}: ${target}`),
    );
    assertEqual(brokenLinks, []);
  });

  it("resolves every reference to a record in the repository", () => {
    assertEqual(
      references
        .filter(({ target }) => !existsSync(new URL(target, root)))
        .map(({ file, target }) => `${file}: ${target}`),
      [],
    );
  });

  it("points to accepted records only from outside docs/adr", () => {
    assertEqual(
      references
        .filter(({ file, target }) => {
          const status = statusByFile.get(target.slice("docs/adr/".length));
          return (
            !file.startsWith("docs/adr/") &&
            status != null &&
            status !== "- Status: Accepted"
          );
        })
        .map(({ file, target }) => `${file}: ${target}`),
      [],
    );
  });
});
