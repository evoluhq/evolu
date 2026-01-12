import { slugifyWithCounter } from "@sindresorhus/slugify";
import glob from "fast-glob";
import * as fs from "fs";
import { toString } from "mdast-util-to-string";
import * as path from "path";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { createLoader } from "simple-functional-loader";
import { filter } from "unist-util-filter";
import { SKIP, visit } from "unist-util-visit";
import * as url from "url";
import { addSyntheticH1 } from "./searchUtils.js";

const __filename = url.fileURLToPath(import.meta.url);
const searchIndexPath = path.resolve(
  path.dirname(__filename),
  "./searchIndex.js",
);
const processor = remark().use(remarkMdx).use(extractSections);
const slugify = slugifyWithCounter();

function isObjectExpression(node) {
  return (
    node.type === "mdxTextExpression" &&
    node.data?.estree?.body?.[0]?.expression?.type === "ObjectExpression"
  );
}

function excludeObjectExpressions(tree) {
  return filter(tree, (node) => !isObjectExpression(node));
}

function extractSections() {
  return (tree, { sections }) => {
    slugify.reset();

    visit(tree, (node) => {
      if (node.type === "heading" && node.depth <= 2) {
        let content = toString(excludeObjectExpressions(node));
        let hash = node.depth === 1 ? null : slugify(content);
        sections.push([content, hash, []]);
        return SKIP;
      }
      // Extract text from paragraphs, table cells, list items, etc.
      if (
        node.type === "paragraph" ||
        node.type === "tableCell" ||
        node.type === "listItem"
      ) {
        let content = toString(excludeObjectExpressions(node));
        sections.at(-1)?.[2].push(content);
        return SKIP;
      }
    });
  };
}

export default function Search(nextConfig = {}) {
  let cache = new Map();

  return Object.assign({}, nextConfig, {
    webpack(config, options) {
      config.module.rules.push({
        test: __filename,
        use: [
          createLoader(function () {
            let appDir = path.resolve("./src/app");
            this.addContextDependency(appDir);

            let files = glob.sync("**/*.mdx", { cwd: appDir });
            let data = files.map((file) => {
              let url = "/" + file.replace(/(^|\/)page\.mdx$/, "");
              url = url.replace("(docs)/", "");
              url = url.replace("(landing)/", "");
              let mdx = fs.readFileSync(path.join(appDir, file), "utf8");

              let sections = [];

              if (cache.get(file)?.[0] === mdx) {
                sections = cache.get(file)[1];
              } else {
                let vfile = { value: mdx, sections };
                processor.runSync(processor.parse(vfile), vfile);

                addSyntheticH1(sections, mdx);

                cache.set(file, [mdx, sections]);
              }

              return { url, sections };
            });

            // Read the search index template and inject the data
            const template = fs.readFileSync(searchIndexPath, "utf8");
            return template.replace(
              'const data = "DATA_PLACEHOLDER";',
              `const data = ${JSON.stringify(data)};`,
            );
          }),
        ],
      });

      if (typeof nextConfig.webpack === "function") {
        return nextConfig.webpack(config, options);
      }

      return config;
    },
  });
}
