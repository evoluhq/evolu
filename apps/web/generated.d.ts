declare module "@/data/sections.json" {
  const sections: Record<
    string,
    Array<import("@/components/SectionProvider").Section>
  >;

  export default sections;
}
