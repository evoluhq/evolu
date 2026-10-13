import { assertEqual, assertThrowsInstanceOf, assertTrue } from "@evolu/common";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { after, beforeEach, describe, it, mock } from "node:test";

const appDirectory = resolve(import.meta.dirname, "../..");
const previousWorkingDirectory = process.cwd();
process.chdir(appDirectory);

const mdxFiles = [
  "../../../lib/_fixtures/api-reference/page.mdx",
  "../../../lib/_fixtures/api-reference/other.mdx",
  "library/page.mdx",
  "page.mdx",
];
const fastGlob = mock.fn(() => Promise.resolve(mdxFiles));

mock.module("fast-glob", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
  exports: { default: fastGlob },
});
mock.module("./navigation.ts", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
  exports: {
    navigation: [
      {
        title: "Docs",
        links: [
          { title: "Overview", href: "/docs" },
          { title: "Testing", href: "/docs/testing" },
          { title: "Examples", href: "/docs/examples" },
          { title: "External", href: "https://example.com" },
        ],
      },
    ],
  },
});
const mdxHooks = registerHooks({
  load: (url, context, nextLoad) => {
    if (url.endsWith("/app/(docs)/docs/page.mdx")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const metadata = { title: "Overview" };
          export const sections = [{ title: "Start", id: "start" }];
        `,
      };
    }
    if (url.endsWith("/app/(docs)/docs/library/page.mdx")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export const title = "Library";`,
      };
    }
    if (url.endsWith("/_fixtures/api-reference/page.mdx")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export const metadata = { title: "Fixture API" };`,
      };
    }
    if (url.endsWith("/_fixtures/api-reference/other.mdx")) {
      return { format: "module", shortCircuit: true, source: "" };
    }
    return nextLoad(url, context);
  },
});

after(() => {
  mdxHooks.deregister();
  process.chdir(previousWorkingDirectory);
});

const {
  cleanMdxContent,
  createLlmsIndex,
  excludePaths,
  fetchProcessedMdxPages,
  loadMdxContent,
} = await import("./llms.ts");

beforeEach(() => {
  fastGlob.mock.resetCalls();
});

describe("cleanMdxContent", () => {
  it("preserves announcement content as a blockquote", () => {
    assertEqual(
      cleanMdxContent(`
<Announcement>
  Upgrading from Evolu 7?
  Existing data is preserved.
</Announcement>
`),
      "> Upgrading from Evolu 7?\n> Existing data is preserved.",
    );
  });

  it("converts documentation MDX to plain Markdown", () => {
    assertEqual(
      cleanMdxContent(`
import { Example } from "./Example.ts";

export const metadata = { title: "Example" };
export const sections = [{ title: "Intro", id: "intro" }];

<Heading level={2} id="intro"> Intro </Heading>

<Note>
  Read this.
</Note>

<Example />
<Example>Hidden</Example>

[Anchor](#intro)
[Root](/docs/testing)
[Relative](docs/testing)
[External](https://example.com)
`),
      `## Intro

> Read this.

[Anchor](#intro)
[Root](https://evolu.dev/docs/testing)
[Relative](https://evolu.dev/docs/testing)
[External](https://example.com)`,
    );
  });

  it("keeps code examples as written", () => {
    assertEqual(
      cleanMdxContent(`
import { Heading } from "@/components/Heading";

<SinglePlatformCodeGroup>

\`\`\`tsx {{ title: 'React' }}
import { FC } from "react";

export const App: FC = () => <Section title="Todos"><Todo /></Section>;
const first = handlers[0](event);
\`\`\`

</SinglePlatformCodeGroup>
`),
      `\`\`\`tsx {{ title: 'React' }}
import { FC } from "react";

export const App: FC = () => <Section title="Todos"><Todo /></Section>;
const first = handlers[0](event);
\`\`\``,
    );
  });

  it("ends a code example only at a fence at least as long as its opener", () => {
    const source = [
      "````md",
      "```ts",
      "const a = 1;",
      "```",
      "<Example />",
      "````",
    ].join("\n");
    assertEqual(cleanMdxContent(source), source);
  });

  it("keeps a code example inside a note quoted", () => {
    assertEqual(
      cleanMdxContent(
        [
          "<Note>",
          "  Read this.",
          "",
          "```ts",
          "const a = 1;",
          "const b = 2;",
          "```",
          "</Note>",
        ].join("\n"),
      ),
      "> Read this.\n> \n> ```ts\n> const a = 1;\n> const b = 2;\n> ```",
    );
  });

  it("throws when a component would remove a code example", () => {
    assertEqual(
      assertThrowsInstanceOf(
        () => cleanMdxContent("<Tabs>\n\n```ts\nconst a = 1;\n```\n\n</Tabs>"),
        Error,
      ).message,
      "Cleaning MDX removed 1 of 1 code examples.",
    );
  });

  it("drops the blank line after hidden lines that open a code example", () => {
    assertEqual(
      cleanMdxContent(
        [
          "Text.",
          "",
          "```ts",
          "// ---cut-start---",
          "const answer = 42;",
          "// ---cut-end---",
          "",
          "console.log(answer);",
          "```",
        ].join("\n"),
      ),
      "Text.\n\n```ts\nconsole.log(answer);\n```",
    );
  });

  it("removes the hidden lines of code examples", () => {
    assertEqual(
      cleanMdxContent(`
\`\`\`ts
// ---cut-start---
const answer = 42;
// ---cut-end---
console.log(answer);
\`\`\`
`),
      "```ts\nconsole.log(answer);\n```",
    );
  });
});

describe("loadMdxContent", () => {
  it("loads content and metadata", async () => {
    const page = await loadMdxContent(
      resolve(appDirectory, "src/app/(docs)/docs/page.mdx"),
      "page.mdx",
    );

    assertEqual(page.path, "/(docs)/docs/");
    assertEqual(page.title, "Overview");
    assertEqual(page.sections, [{ title: "Start", id: "start" }]);
    assertTrue(page.content.length > 0);

    const libraryPage = await loadMdxContent(
      resolve(appDirectory, "src/app/(docs)/docs/library/page.mdx"),
      "library/page.mdx",
    );
    assertEqual(libraryPage.title, "Library");
    assertEqual(libraryPage.sections, []);
  });

  it("returns an empty page when loading fails", async () => {
    const consoleError = mock.method(console, "error", () => undefined);

    assertEqual(await loadMdxContent("missing.mdx", "missing/page.mdx"), {
      path: "/(docs)/docs/missing/",
      title: "page.mdx",
      sections: [],
      content: "",
    });
    assertEqual(consoleError.mock.callCount(), 1);
    consoleError.mock.restore();
  });
});

describe("fetchProcessedMdxPages", () => {
  it("sorts and loads pages with the requested exclusions", async () => {
    const pages = await fetchProcessedMdxPages();
    assertEqual(
      pages.map((page) => page.title),
      ["Overview", "Library", "Fixture API", "other.mdx"],
    );
    assertEqual(fastGlob.mock.calls[0].arguments, [
      "**/*.mdx",
      { cwd: "src/app/(docs)/docs", ignore: excludePaths },
    ]);

    await fetchProcessedMdxPages(true);
    assertEqual(fastGlob.mock.calls[1].arguments, [
      "**/*.mdx",
      {
        cwd: "src/app/(docs)/docs",
        ignore: excludePaths.filter((path) => path !== "api-reference"),
      },
    ]);
  });
});

describe("createLlmsIndex", () => {
  it("creates the default documentation index", async () => {
    assertEqual(
      await createLlmsIndex({ baseUrl: "https://example.test/" }),
      `# Evolu

> Evolu is a local-first platform and TypeScript library.

Use these links for LLM-friendly documentation.

## Docs
- [Overview](https://example.test/docs/index.md)
- [Testing](https://example.test/docs/testing.md)

## Optional
- [Full docs with API reference](https://example.test/llms-full.txt)`,
    );
  });

  it("includes API reference pages", async () => {
    const index = await createLlmsIndex({ includeApiReference: true });

    assertTrue(index.includes("## API reference"));
    assertTrue(
      index.includes(
        "- [Fixture API](https://www.evolu.dev/docs/../../../lib/_fixtures/api-reference.md)",
      ),
    );
  });
});
