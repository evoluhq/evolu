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
    links: [{ title: "Overview", href: "/docs" }],
  },
  {
    title: "Library",
    links: [
      { title: "Getting started", href: "/docs/library" },
      {
        title: "Result",
        href: "/docs/api-reference/common/Result/type-aliases/Result",
      },
      {
        title: "Task",
        href: "/docs/api-reference/common/Task/interfaces/Task",
      },
      {
        title: "Type",
        href: "/docs/api-reference/common/Type/interfaces/Type",
      },
      { title: "Dependency injection", href: "/docs/dependency-injection" },
      { title: "Conventions", href: "/docs/conventions" },
    ],
  },
  {
    title: "Local-first",
    links: [
      { title: "Getting started", href: "/docs/local-first" },
      { title: "Playgrounds", href: "/docs/playgrounds" },
      { title: "Examples", href: "/docs/examples" },
      {
        title: "Owners",
        href: "/docs/api-reference/common/local-first/interfaces/Owner",
      },
      { title: "Relay", href: "/docs/relay" },
      { title: "Migrations", href: "/docs/migrations" },
      { title: "Time travel", href: "/docs/time-travel" },
      { title: "Indexes", href: "/docs/indexes" },
      {
        title: "Protocol",
        href: "/docs/api-reference/common/local-first/Protocol",
      },
      { title: "Privacy", href: "/docs/privacy" },
      { title: "FAQ", href: "/docs/faq" },
    ],
  },
  {
    title: "Other",
    links: [
      { title: "API reference", href: "/docs/api-reference" },
      { title: "Comparison", href: "/docs/comparison" },
      { title: "Showcase", href: "/docs/showcase" },
      { title: "Changelog", href: "https://github.com/evoluhq/evolu/releases" },
    ],
  },
];
