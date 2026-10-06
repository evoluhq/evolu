/* oxlint-disable eslint/no-console */
import { createGate, ok, tryAsync, type Task } from "@evolu/common";
import glob from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { cleanMdxContent } from "../lib/llms.ts";
import type { SubscribeDep } from "./dev-docs.mts";

const defaultSourceDir = path.join(import.meta.dirname, "../app/(docs)/docs");
const defaultTargetDir = path.join(import.meta.dirname, "../../public/docs");

export interface DocsMarkdownOptions {
  readonly sourceDir?: string;
  readonly targetDir?: string;
}

/**
 * Writes LLM-friendly Markdown for every docs page into `public/docs`.
 *
 * `docs/a/b/page.mdx` becomes `docs/a/b.md`, and the root `docs/page.mdx`
 * becomes `docs/index.md`, so the Markdown URLs linked from each docs page are
 * plain files: `next dev` serves them, and `next build` copies them into the
 * static export beside the pages. Files and directories that belong to no page
 * are deleted, and only changed files are written, so while
 * {@link createDocsMarkdownWatcher} regenerates them for `next dev`, every other
 * page's Markdown stays served.
 */
export const writeDocsMarkdown = async ({
  sourceDir = defaultSourceDir,
  targetDir = defaultTargetDir,
}: DocsMarkdownOptions = {}): Promise<number> => {
  const pages = (await glob("**/page.mdx", { cwd: sourceDir })).map(
    (mdxPath) => {
      const pagePath = path.posix.dirname(mdxPath);
      return {
        mdxPath,
        targetPath: pagePath === "." ? "index.md" : `${pagePath}.md`,
      };
    },
  );
  // Paths relative to targetDir: each Markdown file and its directories.
  const targetEntries = new Set<string>();
  for (const { targetPath } of pages)
    for (
      let entry = targetPath;
      entry !== ".";
      entry = path.posix.dirname(entry)
    )
      targetEntries.add(entry);

  // Deleted before writing: on a case-insensitive file system, a page renamed
  // only by case would otherwise be written into its old spelling, which this
  // loop would then delete.
  for (const entry of await glob("**", {
    cwd: targetDir,
    dot: true,
    onlyFiles: false,
  })) {
    if (!targetEntries.has(entry))
      await fs.rm(path.join(targetDir, entry), {
        force: true,
        recursive: true,
      });
  }

  // Sequential, because the API reference has more pages than the default
  // macOS file-descriptor limit.
  for (const { mdxPath, targetPath } of pages) {
    const mdx = await fs
      .readFile(path.join(sourceDir, mdxPath), "utf8")
      .catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
    // Deleted since the glob, for example by the API reference watcher. The
    // deletion's own change event starts a run that deletes its Markdown.
    if (mdx === null) continue;

    const markdown = cleanMdxContent(mdx);
    const absoluteTargetPath = path.join(targetDir, targetPath);
    // Writing truncates first, so an unchanged file would be empty briefly.
    const current = await fs
      .readFile(absoluteTargetPath, "utf8")
      .catch(() => null);
    if (current === markdown) continue;
    await fs.mkdir(path.dirname(absoluteTargetPath), { recursive: true });
    await fs.writeFile(absoluteTargetPath, markdown);
  }

  return pages.length;
};

/**
 * Writes the docs Markdown with {@link writeDocsMarkdown}, then rewrites it
 * whenever a file under the docs directory changes, including API reference
 * pages the API reference watcher regenerates, so `next dev` serves Markdown
 * that matches the pages.
 */
export const createDocsMarkdownWatcher =
  ({
    sourceDir = defaultSourceDir,
    targetDir = defaultTargetDir,
  }: DocsMarkdownOptions = {}): Task<AsyncDisposable, never, SubscribeDep> =>
  async (run) => {
    const markdownConsole = run.deps.console.child("docs-markdown");
    const generationRequested = createGate();
    await using disposer = new AsyncDisposableStack();
    const watcherRun = disposer.use(run.create());

    const subscription = await run.deps.subscribe(sourceDir, (error) => {
      if (error) {
        watcherRun.panic(error);
        return;
      }
      generationRequested.open();
    });
    disposer.defer(() => subscription.unsubscribe());

    const updateMarkdown: Task<void> = async () => {
      const result = await tryAsync(() =>
        writeDocsMarkdown({ sourceDir, targetDir }),
      );
      if (!result.ok)
        markdownConsole.error("Writing docs Markdown failed.", result.error);
      return ok();
    };

    await run.ok(updateMarkdown);

    void watcherRun(async (run) => {
      for (;;) {
        await run.ok(generationRequested.wait);
        generationRequested.close();
        await run.ok(updateMarkdown);
      }
    });

    return ok(disposer.move());
  };

/* node:coverage ignore next 4 */
if (import.meta.main) {
  const count = await writeDocsMarkdown();
  console.log(`Wrote Markdown for ${count} docs pages.`);
}
