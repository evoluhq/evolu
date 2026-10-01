/**
 * Renders a code example from the repository as an image for posts, in the
 * style of evolu.dev.
 *
 * The image shows an example exactly as the repository documents it, so an
 * example that should look different is improved where it is documented.
 *
 * ```bash
 * # Number the code blocks of a changeset, docs page, or module's JSDoc.
 * node scripts/code-image.mts .changeset/some-change.md --list
 *
 * # Render one of them.
 * node scripts/code-image.mts .changeset/some-change.md --block 1 --out image.png
 *
 * # Render lines of any code file, such as a playground component.
 * node scripts/code-image.mts path/to/Component.tsx --lines 137-153 --out image.png
 * ```
 *
 * Options: `--title` replaces the file name in the title bar, `--header` adds a
 * line above the code, such as a type signature, and `--footer` replaces
 * "evolu.dev". Run with `--help` for the summary.
 */
import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { parseArgs } from "node:util";

export interface CodeBlock {
  /** One-based position among the file's code blocks. */
  readonly index: number;
  /** One-based line of the block's first code line. */
  readonly line: number;
  readonly lang: string;
  readonly code: string;
  /** The declaration a JSDoc example documents, if any. */
  readonly documents: string | null;
}

/**
 * Extracts fenced code blocks: every block of a Markdown or MDX file, and the
 * blocks in JSDoc comments of a TypeScript or JavaScript file.
 */
export const extractCodeBlocks = (
  source: string,
  filePath: string,
): ReadonlyArray<CodeBlock> => {
  const isMarkdown = [".md", ".mdx"].includes(extname(filePath));
  // A JSDoc comment becomes Markdown once its line prefixes are removed, which
  // keeps its line count, so both are searched with one fence pattern.
  const regions = isMarkdown
    ? [{ text: source, offset: 0, end: source.length }]
    : Array.from(source.matchAll(/\/\*\*[\s\S]*?\*\//gu), (match) => ({
        text: match[0].replaceAll(/^[ \t]*\*(?!\/) ?/gmu, ""),
        offset: match.index,
        end: match.index + match[0].length,
      }));

  const blocks: Array<CodeBlock> = [];
  for (const region of regions) {
    // A JSDoc example documents the declaration that follows its comment.
    const documents = isMarkdown
      ? null
      : (source
          .slice(region.end)
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line !== "") ?? null);
    for (const fence of region.text.matchAll(fencePattern)) {
      const code = (fence[4] ?? "").replace(/\s+$/u, "");
      if (code.trim() === "") continue;
      blocks.push({
        index: blocks.length + 1,
        // The code starts on the line after the opening fence.
        line:
          source.slice(0, region.offset).split("\n").length +
          region.text.slice(0, fence.index).split("\n").length,
        lang: (fence[3] ?? "").trim().split(/\s+/u)[0] || "text",
        code,
        documents,
      });
    }
  }
  return blocks;
};

/**
 * Returns a language Shiki highlights: `lang` itself, or plain text for a
 * language it does not know, such as `tree`.
 */
export const toHighlightedLanguage = async (lang: string): Promise<string> => {
  const { bundledLanguages, isSpecialLang } = await import("shiki");
  return Object.hasOwn(bundledLanguages, lang) || isSpecialLang(lang)
    ? lang
    : "text";
};

/** Extracts lines `from` through `to`, one-based, without common indentation. */
export const extractLines = (
  source: string,
  from: number,
  to: number,
): string => {
  const lines = source.split("\n");
  if (from < 1 || to < from || to > lines.length) {
    throw new Error(`Lines ${from}-${to} are outside 1-${lines.length}.`);
  }
  const selected = lines.slice(from - 1, to);
  const indent = Math.min(
    ...selected
      .filter((line) => line.trim() !== "")
      .map((line) => /^[ \t]*/u.exec(line)?.[0].length ?? 0),
  );
  return selected.map((line) => line.slice(indent)).join("\n");
};

// A fence is three or more backticks or tildes, closed by at least as many of
// the same character, as in CommonMark, so a block can show shorter fences. A
// backtick fence's info string has no backticks, or the line is inline code.
const fencePattern =
  /^[ \t]*(([`~])\2{2,})(?:(?<=`)(?![^\n]*`)|(?<=~))([^\n]*)\n([\s\S]*?)^[ \t]*\1\2*[ \t]*$/gmu;

const langByExtension: Readonly<Record<string, string>> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".jsx": "jsx",
  ".vue": "vue",
  ".svelte": "svelte",
};

const help = `Renders a code example as an image for posts.

  node scripts/code-image.mts <file> --list
  node scripts/code-image.mts <file> --block <n> --out <image.png>
  node scripts/code-image.mts <file> --lines <from>-<to> --out <image.png>

<file> is a Markdown or MDX file (changesets, docs pages), whose fenced blocks
are listed, or a code file, whose JSDoc blocks are listed and whose lines can be
rendered.

  --title <text>   title bar text (default: the file name, or example.<lang>)
  --header <code>  a line above the code, such as a type signature
  --footer <text>  footer text (default: evolu.dev)`;

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      list: { type: "boolean" },
      block: { type: "string" },
      lines: { type: "string" },
      title: { type: "string" },
      header: { type: "string" },
      footer: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const [file] = positionals;

  if (values.help || file === undefined) {
    process.stdout.write(`${help}\n`);
    process.exit(values.help ? 0 : 1);
  }

  const source = readFileSync(resolve(file), "utf8");

  if (values.list) {
    const blocks = extractCodeBlocks(source, file);
    if (blocks.length === 0) process.stdout.write("No code blocks.\n");
    for (const block of blocks) {
      const firstLine = block.code.split("\n").find((line) => line.trim());
      process.stdout.write(
        `${block.index}. line ${block.line}, ${block.lang}: ${firstLine?.trim()}` +
          (block.documents ? `\n   documents: ${block.documents}` : "") +
          "\n",
      );
    }
    process.exit(0);
  }

  if (values.out === undefined) throw new Error("Pass --out <image.png>.");

  let code: string;
  let lang: string;
  let defaultTitle: string;
  if (values.block !== undefined) {
    const block = extractCodeBlocks(source, file).find(
      ({ index }) => index === Number(values.block),
    );
    if (!block) throw new Error(`No block ${values.block}; use --list.`);
    ({ code, lang } = block);
    defaultTitle = `example.${lang}`;
  } else if (values.lines !== undefined) {
    const range = /^(\d+)-(\d+)$/u.exec(values.lines);
    if (!range) throw new Error("Pass --lines as <from>-<to>, such as 10-24.");
    code = extractLines(source, Number(range[1]), Number(range[2]));
    lang = langByExtension[extname(file)] ?? "text";
    defaultTitle = basename(file);
  } else {
    throw new Error("Pass --list, --block <n>, or --lines <from>-<to>.");
  }

  const title = values.title ?? defaultTitle;
  const { header } = values;
  const footer = values.footer ?? "evolu.dev";
  const out = resolve(values.out);

  const { codeToHtml } = await import("shiki");
  const { chromium } = await import("playwright");

  const language = await toHighlightedLanguage(lang);
  const highlight = (text: string) =>
    codeToHtml(text, { lang: language, theme: "vesper" });
  const escapeHtml = (text: string): string =>
    text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const headerHtml = header
    ? `<div class="header">${await highlight(header)}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 100vw; height: 100vh; display: grid; place-items: center;
    background: radial-gradient(120% 120% at 0% 0%, #2a2a2a 0%, #101010 55%, #000 100%);
    font-family: -apple-system, "SF Pro Text", Inter, sans-serif; }
  pre, code { font-family: "SF Mono", Menlo, monospace !important; }
  .card { width: max-content; min-width: 1040px; border-radius: 18px; overflow: hidden; background: #101010;
    border: 1px solid #2c2c2c; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
  .bar { height: 46px; display: flex; align-items: center; gap: 9px; padding: 0 20px;
    background: #161616; border-bottom: 1px solid #262626; }
  .dot { width: 13px; height: 13px; border-radius: 50%; }
  .title { margin-left: 14px; color: #8b8b8b; font-size: 15px; }
  .header { padding: 22px 34px 0; }
  .header pre.shiki { font-size: 17px; }
  .code { padding: 18px 34px 30px; }
  pre.shiki { background: transparent !important; font-size: 21px; line-height: 1.6; }
  .footer { display: flex; justify-content: flex-end; padding: 0 34px 22px;
    color: #6f6f6f; font-size: 15px; }
</style></head><body>
  <div class="card">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="title">${escapeHtml(title)}</span>
    </div>
    ${headerHtml}
    <div class="code">${await highlight(code)}</div>
    <div class="footer">${escapeHtml(footer)}</div>
  </div>
</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 675 },
      deviceScaleFactor: 2,
    });
    await page.setContent(html);
    // A long example enlarges the image, which otherwise stays 16:9, the
    // shape X shows uncropped.
    const card = await page.locator(".card").boundingBox();
    if (!card) throw new Error("The code card did not render.");
    await page.setViewportSize({
      width: Math.max(1200, Math.ceil(card.width) + 160),
      height: Math.max(675, Math.ceil(card.height) + 120),
    });
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
  process.stdout.write(`Wrote ${values.out}\n`);
}
