import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSingletonHighlighter } from "shiki";

import { Code, CodeGroup, Pre } from "@/components/Code";

/**
 * Shows code samples from `src/homepage` as tabs.
 *
 * The samples are ordinary TypeScript files, so `pnpm typecheck` proves they
 * compile and that each `@ts-expect-error` line is a compile error. It doesn't
 * check the quoted error messages.
 */
export const SnippetCodeGroup = async ({
  snippets,
}: {
  snippets: ReadonlyArray<{ title: string; file: string }>;
}): Promise<React.ReactElement> => {
  const highlighter = await getSingletonHighlighter({
    themes: ["vesper"],
    langs: ["typescript"],
  });

  const panels = await Promise.all(
    snippets.map(async ({ title, file }) => {
      const code = (
        await readFile(join(process.cwd(), "src/homepage", file), "utf8")
      ).trimEnd();
      const html = highlighter.codeToHtml(code, {
        lang: "typescript",
        theme: "vesper",
        defaultColor: false,
      });
      return { title, code, html };
    }),
  );

  return (
    <CodeGroup title="">
      {panels.map(({ title, code, html }) => (
        <Pre key={title} title={title} code={code}>
          <Code>{html}</Code>
        </Pre>
      ))}
    </CodeGroup>
  );
};
