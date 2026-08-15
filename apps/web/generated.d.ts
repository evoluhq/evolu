declare module "@/data/sections.json" {
  const sections: Record<
    string,
    Array<import("@/components/SectionProvider").Section>
  >;

  export default sections;
}

declare module "*data/searchIndex.json" {
  const searchPages: ReadonlyArray<import("@/mdx/searchClient").SearchPage>;

  export default searchPages;
}
