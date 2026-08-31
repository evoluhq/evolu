/* oxlint-disable eslint/no-console */
import { slugifyWithCounter } from "@sindresorhus/slugify";
import { assertNonNullable } from "@evolu/common";
import glob from "fast-glob";
import { toString } from "mdast-util-to-string";
import fs from "node:fs/promises";
import path from "node:path";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import type { Nodes, Root } from "mdast";
import type { MdxTextExpression } from "mdast-util-mdx-expression";
import type { Plugin } from "unified";
import type { Node } from "unist";
import { filter } from "unist-util-filter";
import { SKIP, visit } from "unist-util-visit";

export const generateSearchIndex = async ({
  sourceDir = path.join(import.meta.dirname, "../app"),
  targetPath = path.join(import.meta.dirname, "../data/searchIndex.json"),
}: {
  readonly sourceDir?: string;
  readonly targetPath?: string;
} = {}): Promise<ReadonlyArray<SearchPage>> => {
  const mdxPaths = (await glob("**/*.mdx", { cwd: sourceDir })).toSorted();
  const pages: Array<SearchPage> = [];

  for (const mdxPath of mdxPaths) {
    const mdx = await fs.readFile(path.join(sourceDir, mdxPath), "utf8");

    try {
      const searchSections: Array<MutableSearchSection> = [];
      const file = { data: { searchSections }, value: mdx };

      processor.runSync(processor.parse(file), file);

      if (searchSections[0]?.hash !== null) {
        const title =
          /export\s+const\s+metadata\s*=\s*\{\s*title:\s*['"]([^'"]+)['"]/mu.exec(
            mdx,
          )?.[1] ?? null;
        if (title) searchSections.unshift({ title, hash: null, content: [] });
      }

      pages.push({
        url: `/${mdxPath.replace(/(^|\/)page\.mdx$/u, "")}`
          .replace("(docs)/", "")
          .replace("(landing)/", ""),
        sections: searchSections,
      });
    } catch (error) {
      throw new Error(`Cannot index ${mdxPath}.`, { cause: error });
    }
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(pages)}\n`);
  await fs.rename(temporaryPath, targetPath);

  return pages;
};

interface SearchPage {
  readonly url: string;
  readonly sections: ReadonlyArray<{
    readonly title: string;
    readonly hash: string | null;
    readonly content: ReadonlyArray<string>;
  }>;
}

interface MutableSearchSection {
  readonly title: string;
  readonly hash: string | null;
  readonly content: Array<string>;
}

declare module "vfile" {
  interface DataMap {
    searchSections: Array<MutableSearchSection>;
  }
}

const processor = remark()
  .use(remarkMdx)
  .use((() => (tree, file) => {
    const sections = file.data.searchSections;
    assertNonNullable(sections);
    const slugify = slugifyWithCounter();

    visit(tree, (node) => {
      if (node.type === "heading" && node.depth <= 2) {
        const content = nodeToSearchText(node);
        const hash = node.depth === 1 ? null : slugify(content);
        sections.push({ title: content, hash, content: [] });
        return SKIP;
      }

      if (
        node.type === "paragraph" ||
        node.type === "tableCell" ||
        node.type === "listItem"
      ) {
        sections.at(-1)?.content.push(nodeToSearchText(node));
        return SKIP;
      }

      return undefined;
    });
  }) satisfies Plugin<[], Root>);

const nodeToSearchText = (node: Nodes): string => {
  const filteredNode = filter(node, (child: Node) => {
    if (!isMdxTextExpression(child)) return true;

    const statement = child.data?.estree?.body[0];
    return (
      statement?.type !== "ExpressionStatement" ||
      statement.expression.type !== "ObjectExpression"
    );
  })!;

  return toString(filteredNode);
};

const isMdxTextExpression = (node: Node): node is MdxTextExpression =>
  node.type === "mdxTextExpression";

/* node:coverage ignore next 4 */
if (import.meta.main) {
  const pages = await generateSearchIndex();
  console.log(`Generated search data for ${pages.length} pages.`);
}
