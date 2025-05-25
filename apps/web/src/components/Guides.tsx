import clsx from "clsx";

import { Button } from "@/components/Button";

const guides = [
  {
    href: "/docs/how-evolu-works",
    name: "How Evolu Works?",
    description: "Evolu is simple. That's the feature, not a bug.",
  },
  {
    href: "/docs/evolu-relay",
    name: "Evolu Relay",
    description:
      "Evolu provides sync and backup for Evolu clients. Self-hostable.",
  },
  {
    href: "/docs/patterns",
    name: "Patterns",
    description: "Relations, Deferred Sync, JSON support, and more.",
  },
  {
    href: "/docs/migrations",
    name: "Migrations",
    description: "Append only schema, nullability, auto migrations, and more.",
  },
];

export function Guides({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <div className={clsx("mt-16 pb-12 xl:max-w-none", className)}>
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/5">
        {guides.map((guide) => (
          <div key={guide.href}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {guide.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.description}
            </p>
            <p className="mt-4">
              <Button href={guide.href} variant="text" arrow="right">
                Read more
              </Button>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
