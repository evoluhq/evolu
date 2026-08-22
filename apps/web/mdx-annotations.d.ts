declare module "mdx-annotations" {
  export const mdxAnnotations: {
    readonly recma: import("unified").Plugin<[], import("estree").Program>;
    readonly rehype: import("unified").Plugin<[], import("hast").Root>;
    readonly remark: import("unified").Plugin<[], import("mdast").Root>;
  };
}
