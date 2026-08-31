import type { MDXComponents } from "mdx/types";

import * as mdxComponents from "@/components/mdx";

// oxlint-disable-next-line typescript/explicit-module-boundary-types
export const useMDXComponents = (components: MDXComponents) => ({
  ...components,
  ...mdxComponents,
});
