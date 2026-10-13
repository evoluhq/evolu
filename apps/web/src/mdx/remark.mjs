import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

const hiddenLinesStart = "// ---cut-start---";
const hiddenLinesEnd = "// ---cut-end---";

/**
 * Removes the lines from `// ---cut-start---` through `// ---cut-end---` in a
 * code example. They hold setup the example checker compiles and runs, such as
 * a schema an earlier example defines, which readers need not see again. Each
 * run of visible lines between hidden ones loses its common indentation, so
 * lines that hidden ones wrap, for example in a component, start at the
 * margin.
 *
 * @type {(code: string) => string}
 */
export const stripHiddenLines = (code) => {
  /** @type {string[][]} */
  const visibleRuns = [[]];
  let isHidden = false;
  // Hidden lines between two blank lines would leave both.
  let skipsBlankLine = false;

  for (const line of code.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine === hiddenLinesStart || trimmedLine === hiddenLinesEnd) {
      const isStart = trimmedLine === hiddenLinesStart;
      if (isStart === isHidden)
        throw new Error(`A code example has an unmatched ${trimmedLine}.`);
      isHidden = isStart;
      if (isHidden) {
        visibleRuns.push([]);
      } else {
        const lastVisibleLine = visibleRuns.flat().at(-1);
        skipsBlankLine =
          lastVisibleLine === undefined || lastVisibleLine === "";
      }
      continue;
    }
    if (isHidden) continue;
    if (skipsBlankLine && line === "") {
      skipsBlankLine = false;
      continue;
    }
    skipsBlankLine = false;
    visibleRuns.at(-1)?.push(line);
  }

  if (isHidden)
    throw new Error(`A code example has an unmatched ${hiddenLinesStart}.`);
  if (visibleRuns.length === 1) return code;

  const visibleLines = visibleRuns.flatMap((run) => {
    const indentation = Math.min(
      ...run
        .filter((line) => line.trim() !== "")
        .map((line) => line.length - line.trimStart().length),
    );
    return run.map((line) => line.slice(indentation));
  });
  while (visibleLines.at(-1) === "") visibleLines.pop();
  return visibleLines.join("\n");
};

/** @type {() => import("unified").Transformer<import("mdast").Root>} */
const remarkHiddenLines = () => (tree) => {
  visit(tree, "code", (node) => {
    node.value = stripHiddenLines(node.value);
  });
};

export const remarkPlugins = [
  // oxlint-disable-next-line typescript/no-unsafe-member-access -- mdx-annotations ships without types; apps/web/mdx-annotations.d.ts supplies this Unified plugin contract.
  mdxAnnotations.remark,
  remarkGfm,
  remarkHiddenLines,
];

export default { plugins: remarkPlugins };
