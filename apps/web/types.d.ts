import type { PluggableList } from "unified";

declare module "../src/mdx/rehype.mjs" {
  export const rehypePlugins: PluggableList;
}

declare module "../src/mdx/remark.mjs" {
  export const remarkPlugins: PluggableList;
}
