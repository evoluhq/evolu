import assert from "node:assert/strict";
import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { compile, createProcessor } from "@mdx-js/mdx";
import type { Nodes } from "mdast";
import { navigation } from "../../../../apps/web/src/lib/navigation.ts";
import { rehypePlugins } from "../../../../apps/web/src/mdx/rehype.mjs";
import { remarkPlugins } from "../../../../apps/web/src/mdx/remark.mjs";
import { generateSearchIndex } from "../../../../apps/web/src/scripts/generate-search-index.mts";
import { writeDocsMarkdown } from "../../../../apps/web/src/scripts/write-docs-markdown.mts";

const siteOrigin = "https://www.evolu.dev";
const webDir = path.join(import.meta.dirname, "../../../../apps/web");
const appDir = path.join(webDir, "src/app");
const publicDir = path.join(webDir, "public");
const apiReferenceDir = "(docs)/docs/api-reference/";
const fixturesDir = path.join(import.meta.dirname, "__fixtures__");

assert.ok(
  existsSync(path.join(appDir, apiReferenceDir, "page.mdx")),
  "The generated API reference is missing. Run `pnpm build:docs` first.",
);

// Next.js serves app/(group)/a/page.tsx at /a.
const filePathToUrl = (filePath: string): string =>
  `/${path
    .dirname(filePath)
    .split("/")
    .filter((segment) => segment !== "." && !/^\(.+\)$/u.test(segment))
    .join("/")}`;

const mdxPagePaths = globSync("**/page.mdx", { cwd: appDir }).toSorted();
const mdxPagePathByUrl = new Map(
  mdxPagePaths.map((pagePath) => [filePathToUrl(pagePath), pagePath]),
);
const codeRouteUrls = new Set(
  globSync("**/{page,route}.{ts,tsx}", { cwd: appDir }).map(filePathToUrl),
);

await using buildDir = await fs.mkdtempDisposable(
  path.join(os.tmpdir(), "evolu-docs-test-"),
);
const searchPages = await generateSearchIndex({
  targetPath: path.join(buildDir.path, "searchIndex.json"),
});

// The web build writes the gitignored public/docs, so it is written here
// instead of read from a build that may be missing or stale.
const generatedPublicDir = path.join(buildDir.path, "public");
await writeDocsMarkdown({ targetDir: path.join(generatedPublicDir, "docs") });

const listFileUrls = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map(
      (entry) =>
        `/${path.relative(dir, path.join(entry.parentPath, entry.name))}`,
    );

const publicFileUrls = new Set([
  ...listFileUrls(publicDir).filter((url) => !url.startsWith("/docs/")),
  ...listFileUrls(generatedPublicDir),
]);

// The site gives h2 headings ids with rehypeSlugify from
// apps/web/src/mdx/rehype.mjs, and the search index slugs them the same way.
const sectionHashesByUrl = new Map(
  searchPages.map(({ url, sections }) => [
    url,
    new Set(sections.flatMap(({ hash }) => hash ?? [])),
  ]),
);

const mdxParser = createProcessor({ remarkPlugins });

const visitNodes = (node: Nodes, visitor: (node: Nodes) => void): void => {
  visitor(node);
  if ("children" in node)
    for (const child of node.children) visitNodes(child, visitor);
};

const getJsxAttribute = (node: Nodes, name: string): string | null => {
  if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement")
    return null;
  for (const attribute of node.attributes)
    if (
      attribute.type === "mdxJsxAttribute" &&
      attribute.name === name &&
      typeof attribute.value === "string"
    )
      return attribute.value;
  return null;
};

// A link with a scheme, such as https: or mailto:, or a protocol-relative link
// can leave the site. The browser resolves any other link against the page.
const isExternalLink = (url: string): boolean =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(url);

// Generated pages link to the anchors of pages such as Type hundreds of times.
const jsxIdsByMdxPagePath = new Map<string, ReadonlySet<string>>();

/** Returns why a link to this site does not resolve, or `null` if it does. */
const findLinkProblem = ({ pathname, hash }: URL): string | null => {
  const urlPath = decodeURIComponent(pathname);
  const sectionHashes = sectionHashesByUrl.get(urlPath);

  // Ids on TSX pages and in public files exist only in their rendered output,
  // so only the path of a link to them is checked.
  if (!sectionHashes)
    return codeRouteUrls.has(urlPath) || publicFileUrls.has(urlPath)
      ? null
      : "no such page or file";

  const id = decodeURIComponent(hash.slice(1));
  if (id === "" || sectionHashes.has(id)) return null;

  // JSX elements, such as the <a id> anchors TypeDoc puts before members, can
  // give a page other ids.
  const mdxPagePath = mdxPagePathByUrl.get(urlPath);
  if (mdxPagePath === undefined) return "no such anchor";
  let jsxIds = jsxIdsByMdxPagePath.get(mdxPagePath);
  if (jsxIds === undefined) {
    const ids = new Set<string>();
    visitNodes(
      mdxParser.parse(readFileSync(path.join(appDir, mdxPagePath), "utf8")),
      (node) => {
        const jsxId = getJsxAttribute(node, "id");
        if (jsxId !== null) ids.add(jsxId);
      },
    );
    jsxIds = ids;
    jsxIdsByMdxPagePath.set(mdxPagePath, jsxIds);
  }
  return jsxIds.has(id) ? null : "no such anchor";
};

/**
 * Compiles an MDX page served at `pageUrl` with the web build's remark and
 * rehype plugins and returns its internal links that do not resolve.
 */
const checkPage = async (
  filePath: string,
  pageUrl: string,
): Promise<ReadonlyArray<string>> => {
  await compile(
    { path: filePath, value: readFileSync(filePath, "utf8") },
    { remarkPlugins, rehypePlugins },
  );
  return findBrokenLinks(filePath, pageUrl);
};

/**
 * Returns the internal links of an MDX page served at `pageUrl` that do not
 * resolve.
 */
const findBrokenLinks = (
  filePath: string,
  pageUrl: string,
): ReadonlyArray<string> => {
  const file = { path: filePath, value: readFileSync(filePath, "utf8") };
  const brokenLinks: Array<string> = [];
  visitNodes(mdxParser.parse(file), (node) => {
    const urls =
      node.type === "link" ||
      node.type === "definition" ||
      node.type === "image"
        ? [node.url]
        : [getJsxAttribute(node, "href"), getJsxAttribute(node, "src")];

    for (const url of urls) {
      if (url === null || isExternalLink(url)) continue;
      const problem = findLinkProblem(new URL(url, `${siteOrigin}${pageUrl}`));
      if (problem === null) continue;
      assert.ok(node.position, "The MDX parser positions every node.");
      brokenLinks.push(`${url} (line ${node.position.start.line}): ${problem}`);
    }
  });
  return brokenLinks;
};

void describe("handwritten MDX pages compile and link to existing pages", () => {
  for (const pagePath of mdxPagePaths) {
    if (pagePath.startsWith(apiReferenceDir)) continue;

    void it(pagePath, async () => {
      const brokenLinks = await checkPage(
        path.join(appDir, pagePath),
        filePathToUrl(pagePath),
      );
      assert.deepEqual(
        brokenLinks,
        [],
        `${pagePath} has broken links:\n${brokenLinks.join("\n")}`,
      );
    });
  }
});

void it("generated API reference pages link to existing pages", () => {
  const brokenLinks = mdxPagePaths
    .filter((pagePath) => pagePath.startsWith(apiReferenceDir))
    .flatMap((pagePath) =>
      findBrokenLinks(path.join(appDir, pagePath), filePathToUrl(pagePath)).map(
        (brokenLink) => `${pagePath}: ${brokenLink}`,
      ),
    );
  assert.deepEqual(
    brokenLinks,
    [],
    `Generated API reference pages have broken links:\n${brokenLinks.join("\n")}`,
  );
});

void it("navigation links resolve", () => {
  const brokenLinks = navigation.flatMap(({ links }) =>
    links.flatMap(({ href }) => {
      const problem = isExternalLink(href)
        ? null
        : findLinkProblem(new URL(href, siteOrigin));
      return problem === null ? [] : [`${href}: ${problem}`];
    }),
  );
  assert.deepEqual(
    brokenLinks,
    [],
    `apps/web/src/lib/navigation.ts has broken links:\n${brokenLinks.join("\n")}`,
  );
});

void describe("checkPage", () => {
  void it("reports each broken internal link", async () => {
    assert.deepEqual(
      await checkPage(
        path.join(fixturesDir, "BrokenLinks.mdx"),
        "/docs/local-first",
      ),
      [
        "/docs/no-such-page (line 9): no such page or file",
        "#no-such-section (line 11): no such anchor",
        "../no-such-page (line 12): no such page or file",
        "/blog/no-such-post (line 13): no such page or file",
        "/no-such-image.svg (line 15): no such page or file",
        "/docs/local-first#no-such-section (line 17): no such anchor",
      ],
    );
  });

  void it("rejects MDX that only the web build plugins reject", async () => {
    await assert.rejects(
      checkPage(path.join(fixturesDir, "UnknownLanguage.mdx"), "/docs/fixture"),
      {
        name: "ShikiError",
        message: "Language `python` not found, you may need to load it first",
      },
    );
  });
});
