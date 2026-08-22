import { slugifyWithCounter } from "@sindresorhus/slugify";
import * as acorn from "acorn";
import { toString } from "mdast-util-to-string";
import { mdxAnnotations } from "mdx-annotations";
import { getSingletonHighlighter } from "shiki";
import { visit } from "unist-util-visit";

/** @type {() => import("unified").Transformer<import("hast").Root>} */
const rehypeParseCodeBlocks = () => {
  return (tree) => {
    visit(tree, "element", (node, _nodeIndex, parentNode) => {
      if (node.tagName !== "code" || parentNode?.type !== "element") return;

      const className = node.properties.className;
      parentNode.properties.language =
        Array.isArray(className) && typeof className[0] === "string"
          ? className[0].replace(/^language-/u, "")
          : "txt";
    });
  };
};

/** @type {import("shiki").Highlighter} */
let highlighter;

/** @type {() => import("unified").Transformer<import("hast").Root>} */
const rehypeShiki = () => {
  return async (tree) => {
    highlighter ??= await getSingletonHighlighter({
      themes: ["vesper"],
      langs: ["js", "typescript", "bash", "tsx", "sql", "json"],
    });

    visit(tree, "element", (node) => {
      const codeNode = node.children[0];
      if (
        node.tagName === "pre" &&
        codeNode?.type === "element" &&
        codeNode.tagName === "code"
      ) {
        const textNode = codeNode.children[0];
        if (textNode?.type !== "text") return;

        node.properties.code = textNode.value;

        const language = node.properties.language;
        if (typeof language === "string") {
          textNode.value = highlighter.codeToHtml(textNode.value, {
            lang: language,
            theme: "vesper",
            defaultColor: false,
          });
        }
      }
    });
  };
};

/** @type {() => import("unified").Transformer<import("hast").Root>} */
const rehypeSlugify = () => {
  return (tree) => {
    let slugify = slugifyWithCounter();
    visit(tree, "element", (node) => {
      if (node.tagName === "h2" && !node.properties.id) {
        node.properties.id = slugify(toString(node));
      }
    });
  };
};

/**
 * @type {(
 *   getExports: (
 *     tree: import("hast").Root,
 *   ) => Readonly<Record<string, string>>,
 * ) => import("unified").Transformer<import("hast").Root>}
 */
const rehypeAddMDXExports = (getExports) => {
  return (tree) => {
    let exports = Object.entries(getExports(tree));

    for (let [name, value] of exports) {
      for (let node of tree.children) {
        if (
          node.type === "mdxjsEsm" &&
          new RegExp(`export\\s+const\\s+${name}\\s*=`, "u").test(node.value)
        ) {
          return;
        }
      }

      let exportStr = `export const ${name} = ${value}`;

      tree.children.push({
        type: "mdxjsEsm",
        value: exportStr,
        data: {
          estree: acorn.parse(exportStr, {
            sourceType: "module",
            ecmaVersion: "latest",
          }),
        },
      });
    }
  };
};

/** @type {(node: import("hast").Root | import("hast").Element) => string[]} */
const getSections = (node) => {
  /** @type {string[]} */
  const sections = [];

  for (let child of node.children ?? []) {
    if (child.type === "element" && child.tagName === "h2") {
      let title = toString(child);
      if (title === "Call Signature") continue;
      const annotation = child.properties.annotation;
      if (annotation != null && typeof annotation !== "string") {
        throw new TypeError("Expected the heading annotation to be a string.");
      }

      sections.push(`{
        title: ${JSON.stringify(title)},
        id: ${JSON.stringify(child.properties.id)},
        ...${annotation}
      }`);
    } else if ("children" in child && Array.isArray(child.children)) {
      sections.push(...getSections(child));
    }
  }

  return sections;
};

export const rehypePlugins = [
  // oxlint-disable-next-line typescript/no-unsafe-member-access -- mdx-annotations ships without types; apps/web/mdx-annotations.d.ts supplies this Unified plugin contract.
  mdxAnnotations.rehype,
  rehypeParseCodeBlocks,
  rehypeShiki,
  rehypeSlugify,
  [
    rehypeAddMDXExports,
    /** @type {(tree: import("hast").Root) => { readonly sections: string }} */
    (tree) => ({
      sections: `[${getSections(tree).join()}]`,
    }),
  ],
];

export default { plugins: rehypePlugins };
