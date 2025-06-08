export interface NavGroup {
  title: string;
  links: Array<{
    title: string;
    href: string;
  }>;
}

export const navigation: Array<NavGroup> = [
  {
    title: "Getting started",
    links: [{ title: "Quickstart", href: "/docs/quickstart" }],
  },
  {
    title: "Library",
    links: [
      { title: "Result", href: "/docs/api-reference/common/Result" },
      { title: "Type", href: "/docs/api-reference/common/Type" },
      { title: "Dependency injection", href: "/docs/dependency-injection" },
      { title: "Conventions", href: "/docs/conventions" },
    ],
  },
  {
    title: "Local-first",
    links: [
      { title: "Indexes", href: "/docs/indexes" },
      { title: "Migrations", href: "/docs/migrations" },
      { title: "Patterns", href: "/docs/patterns" },
      { title: "Time travel", href: "/docs/time-travel" },
      { title: "Examples", href: "/docs/examples" },
      { title: "Privacy", href: "/docs/privacy" },
    ],
  },
  {
    title: "Other",
    links: [
      { title: "API reference", href: "/docs/api-reference" },
      { title: "Comparison", href: "/docs/comparison" },
      { title: "Showcase", href: "/docs/showcase" },
      { title: "FAQ", href: "/docs/faq" },
      { title: "Changelog", href: "https://github.com/evoluhq/evolu/releases" },
    ],
  },
];
