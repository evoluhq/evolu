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
        title: "Array",
        href: "/docs/api-reference/common/Array",
      },
      {
        title: "Result",
        href: "/docs/api-reference/common/Result",
      },
      { title: "Dependency injection", href: "/docs/dependency-injection" },
      { title: "Resource management", href: "/docs/resource-management" },
      {
        title: "Task",
        href: "/docs/api-reference/common/Task",
      },
      {
        title: "Type",
        href: "/docs/api-reference/common/Type",
      },
      { title: "Conventions", href: "/docs/conventions" },
      { title: "Testing", href: "/docs/testing" },
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
        href: "/docs/api-reference/common/local-first/Owner",
      },
      { title: "Schema", href: "/docs/schema" },
      { title: "Relay", href: "/docs/relay" },
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
      { title: "Comparison", href: "/docs/comparison" },
      { title: "Showcase", href: "/docs/showcase" },
      { title: "Changelog", href: "https://github.com/evoluhq/evolu/releases" },
    ],
  },
];
