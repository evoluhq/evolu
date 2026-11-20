export interface NavGroup {
  title: string;
  links: Array<{
    title: string;
    href: string;
    /** Turns off prefetching for a page too large to fetch on every visit. */
    prefetch?: false;
  }>;
}

export const navigation: Array<NavGroup> = [
  {
    title: "Getting started",
    links: [{ title: "Overview", href: "/docs" }],
  },
  {
    title: "Local-first",
    links: [
      { title: "Getting started", href: "/docs/local-first" },
      { title: "Playgrounds", href: "/docs/playgrounds" },
      { title: "Examples", href: "/docs/examples" },
      { title: "React Native", href: "/docs/react-native" },
      { title: "Schema", href: "/docs/schema" },
      { title: "Local auth", href: "/docs/local-auth" },
      { title: "Queries", href: "/docs/queries" },
      { title: "Sync", href: "/docs/sync" },
      { title: "Relay", href: "/docs/relay" },
      { title: "Privacy", href: "/docs/privacy" },
      { title: "Indexes", href: "/docs/indexes" },
      { title: "Time travel", href: "/docs/time-travel" },
      {
        title: "Owners",
        href: "/docs/api-reference/common/local-first/Owner",
      },
      {
        title: "Protocol",
        href: "/docs/api-reference/common/local-first/Protocol",
      },
      { title: "FAQ", href: "/docs/faq" },
    ],
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
        title: "Type",
        href: "/docs/api-reference/common/Type",
      },
      {
        title: "Task",
        href: "/docs/api-reference/common/Task",
      },
      { title: "Conventions", href: "/docs/conventions" },
      { title: "Testing", href: "/docs/testing" },
      { title: "Assert", href: "/docs/api-reference/common/Assert" },
    ],
  },
  {
    title: "Other",
    links: [
      { title: "Comparison", href: "/docs/comparison", prefetch: false },
      { title: "Supply chain", href: "/docs/supply-chain" },
      { title: "Showcase", href: "/docs/showcase" },
      { title: "Upgrading", href: "/docs/upgrading" },
      { title: "Changelog", href: "https://github.com/evoluhq/evolu/releases" },
    ],
  },
];
