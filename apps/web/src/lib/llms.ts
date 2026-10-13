import fs from "fs";
import { stripHiddenLines } from "../mdx/remark.mjs";
import { navigation } from "./navigation.ts";

// As in CommonMark, a fence closes at a run of its character at least as long
// as the one that opened it.
const codeFencePattern =
  /^[ \t]*((`|~)\2{2,})[^\n]*\n[\s\S]*?^[ \t]*\1\2*[ \t]*$/gmu;
const codeFencePlaceholder = "\uE000";
// What precedes a placeholder on its line, such as a quote prefix from a note,
// precedes every line of the restored code fence.
const codeFencePlaceholderPattern = /^(.*?)\uE000(\d+)\uE000/gmu;

/**
 * Cleans MDX content by removing imports, exports, JSX components, and the
 * hidden lines of code examples, and converting relative links. Code examples
 * are otherwise kept as written. It throws when a component that wraps a code
 * example would remove it, because only code groups are unwrapped.
 */
export const cleanMdxContent = (content: string): string => {
  // Code examples are set aside, so no replacement below changes them, and
  // lose their hidden lines as on the website.
  const codeFences: Array<string> = [];
  let cleanedContent = content.replaceAll(
    codeFencePattern,
    (codeFence: string) => {
      const lines = codeFence.split("\n");
      codeFences.push(
        [
          lines[0],
          stripHiddenLines(lines.slice(1, -1).join("\n")),
          lines.at(-1),
        ].join("\n"),
      );
      return `${codeFencePlaceholder}${codeFences.length - 1}${codeFencePlaceholder}`;
    },
  );

  // Remove import statements - ensuring we catch all top-level imports
  cleanedContent = cleanedContent.replaceAll(
    /^import\s+.*?['"].*?['"];?\s*$/gmu,
    "",
  );

  // Remove export statements including metadata objects and sections arrays
  cleanedContent = cleanedContent.replaceAll(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]*?\};\s*/gu,
    "",
  );
  cleanedContent = cleanedContent.replaceAll(
    /export\s+const\s+sections\s*=\s*\[[\s\S]*?\];\s*/gu,
    "",
  );

  // Convert <Heading level={2} id="...">Title</Heading> to ## Title
  cleanedContent = cleanedContent.replaceAll(
    /<Heading\s+level=\{(\d)\}\s+id="[^"]*">\s*([\s\S]*?)\s*<\/Heading>/gu,
    (_match: string, level: string, title: string) => {
      const hashes = "#".repeat(Number(level));
      return `${hashes} ${title.trim()}`;
    },
  );

  // Convert alert content to blockquotes
  cleanedContent = cleanedContent.replaceAll(
    /<(Announcement|Note)>\s*([\s\S]*?)\s*<\/\1>/gu,
    (_match: string, _component: string, alertContent: string) => {
      const lines = alertContent.trim().split("\n");
      return lines.map((line) => `> ${line.trim()}`).join("\n");
    },
  );

  // Unwrap code groups, keeping their code examples
  cleanedContent = cleanedContent.replaceAll(
    /<\/?(?:SinglePlatform)?CodeGroup\b[^>]*>/gu,
    "",
  );

  // Remove self-closing JSX component tags
  cleanedContent = cleanedContent.replaceAll(/<[A-Z][a-zA-Z]*[^>]*\/>/gu, "");

  // Remove other JSX component tags with content (generic fallback)
  cleanedContent = cleanedContent.replaceAll(
    /<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/gu,
    "",
  );

  // Convert relative links to absolute links with predefined prefix
  const baseUrl = "https://evolu.dev/";
  cleanedContent = cleanedContent.replaceAll(
    /\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/gu,
    (match: string, text: string, url: string) => {
      // Skip conversion for anchor links that start with #
      if (url.startsWith("#")) {
        return match;
      }
      // Remove leading slash if present
      const cleanUrl = url.startsWith("/") ? url.slice(1) : url;
      return `[${text}](${baseUrl}${cleanUrl})`;
    },
  );

  // Clean up multiple consecutive blank lines
  cleanedContent = cleanedContent.replaceAll(/\n{3,}/gu, "\n\n");

  let restoredCodeFenceCount = 0;
  cleanedContent = cleanedContent.replaceAll(
    codeFencePlaceholderPattern,
    (_placeholder: string, linePrefix: string, index: string) => {
      restoredCodeFenceCount++;
      return (codeFences[Number(index)] ?? "")
        .split("\n")
        .map((line) => `${linePrefix}${line}`)
        .join("\n");
    },
  );
  if (restoredCodeFenceCount !== codeFences.length)
    throw new Error(
      `Cleaning MDX removed ${codeFences.length - restoredCodeFenceCount} of ${codeFences.length} code examples.`,
    );

  return cleanedContent.trim();
};

export interface MDXModule {
  metadata?: {
    title?: string;
    description?: string;
  };
  title?: string;
  sections?: Array<{ title: string; id: string }>;
}

export const customOrder: Record<string, number> = {
  // Root overview
  "page.mdx": 1,
  // Library section
  library: 10,
  "dependency-injection": 11,
  "resource-management": 12,
  conventions: 13,
  // Local-first section
  "local-first": 20,
  playgrounds: 21,
  relay: 22,
  schema: 23,
  "time-travel": 24,
  indexes: 25,
  privacy: 26,
  faq: 27,
  // API reference last
  "api-reference": 100,
};

export const excludePaths = ["showcase", "examples", "comparison"];

/** Pages to exclude from llms.txt (still available via direct .md URL) */
const llmsExcludePaths = [
  "/docs/showcase",
  "/docs/examples",
  "/docs/comparison",
  // External links
  "https://",
];

const defaultBaseUrl = "https://www.evolu.dev";

/** Creates file list from navigation, preserving order */
const createFileListFromNavigation = (baseUrl: string): Array<string> => {
  const links: Array<string> = [];

  for (const group of navigation) {
    for (const link of group.links) {
      // Skip external links and excluded paths
      if (llmsExcludePaths.some((exclude) => link.href.startsWith(exclude))) {
        continue;
      }

      // Handle root /docs path
      const path = link.href === "/docs" ? "/docs/index.md" : `${link.href}.md`;
      links.push(`- [${link.title}](${baseUrl}${path})`);
    }
  }

  return links;
};

/** Loads and processes MDX content from a file path */
export const loadMdxContent = async (
  fullPath: string,
  relativePath: string,
): Promise<{
  path: string;
  title: string;
  sections: Array<{ title: string; id: string }>;
  content: string;
}> => {
  try {
    const path = `/(docs)/docs/${relativePath.replace(/page\.mdx$/u, "")}`;

    // Read the raw MDX file content
    const rawContent = fs.readFileSync(fullPath, "utf8");
    const cleanedContent = cleanMdxContent(rawContent);

    // Get metadata via dynamic import
    const module = (await import(
      `../app/(docs)/docs/${relativePath}`
    )) as MDXModule;

    // Get title from metadata object or fallback to direct title property or path
    const title =
      module.metadata?.title ??
      module.title ??
      path.slice(path.lastIndexOf("/") + 1);

    return {
      path,
      title,
      sections: module.sections ?? [],
      content: cleanedContent,
    };
  } catch (error) {
    // Log error but continue processing other files
    // oxlint-disable-next-line eslint/no-console
    console.error(`Error loading ${relativePath}:`, error);
    return {
      path: `/(docs)/docs/${relativePath.replace(/page\.mdx$/u, "")}`,
      title: relativePath.slice(relativePath.lastIndexOf("/") + 1),
      sections: [],
      content: "",
    };
  }
};

/** Fetches and processes all MDX files for LLM documentation */
export const fetchProcessedMdxPages = async (
  includeApiReference = false,
): Promise<
  Array<{
    path: string;
    title: string;
    sections: Array<{ title: string; id: string }>;
    content: string;
  }>
> => {
  const glob = await import("fast-glob");

  // TODO: If docs builds hit EMFILE again, replace this wide fast-glob scan
  // with a bounded recursive fs walk and load MDX pages with a small
  // concurrency limit instead of Promise.all. The generated API reference tree
  // can exceed default macOS file-descriptor limits.
  // Find all MDX files, conditionally excluding specified paths
  const ignoreList = includeApiReference
    ? excludePaths.filter((path) => path !== "api-reference")
    : excludePaths;

  const mdxFiles = await glob.default("**/*.mdx", {
    cwd: "src/app/(docs)/docs",
    ignore: ignoreList,
  });

  // Sort files based on custom order
  const sortedFiles = mdxFiles.toSorted((a, b) => {
    const folderA = a.split("/")[0];
    const folderB = b.split("/")[0];

    const orderA = customOrder[folderA] || Number.MAX_SAFE_INTEGER;
    const orderB = customOrder[folderB] || Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Fallback to alphabetical order
    return folderA.localeCompare(folderB);
  });

  // Load the MDX content and metadata
  return Promise.all(
    sortedFiles.map(async (filename) => {
      const fullPath = `${process.cwd()}/src/app/(docs)/docs/${filename}`;
      return loadMdxContent(fullPath, filename);
    }),
  );
};

export const createLlmsIndex = async ({
  includeApiReference = false,
  baseUrl = defaultBaseUrl,
}: {
  includeApiReference?: boolean;
  baseUrl?: string;
} = {}): Promise<string> => {
  const normalizedBaseUrl = baseUrl.replace(/\/$/u, "");

  const lines: Array<string> = [
    "# Evolu",
    "",
    "> Evolu is a local-first platform and TypeScript library.",
    "",
    "Use these links for LLM-friendly documentation.",
    "",
    "## Docs",
    ...createFileListFromNavigation(normalizedBaseUrl),
  ];

  if (includeApiReference) {
    const pages = await fetchProcessedMdxPages(true);
    const apiReferencePages = pages.filter((page) =>
      page.path.includes("/api-reference"),
    );
    lines.push("", "## API reference");
    lines.push(
      ...apiReferencePages.map((page) => {
        const normalizedPath = page.path
          .replace(/^\/\(docs\)\/docs/u, "/docs")
          .replace(/\/$/u, "");
        return `- [${page.title}](${normalizedBaseUrl}${normalizedPath}.md)`;
      }),
    );
  } else {
    lines.push(
      "",
      "## Optional",
      `- [Full docs with API reference](${normalizedBaseUrl}/llms-full.txt)`,
    );
  }

  return lines.join("\n");
};
