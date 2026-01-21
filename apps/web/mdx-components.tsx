import { type MDXComponents } from "mdx/types";

import * as mdxComponents from "@/components/mdx";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const useMDXComponents = (components: MDXComponents) => ({
  ...components,
  ...mdxComponents,
});
