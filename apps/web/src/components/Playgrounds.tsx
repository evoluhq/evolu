import { Button } from "@/components/Button";
import type { FC } from "react";

const playgrounds = [
  {
    name: "Minimal",
    description: "A simple playground to get started with Evolu.",
    href: "/playgrounds/minimal",
  },
  {
    name: "Local-Only",
    description: "Keep data on this device without a relay, and delete it.",
    href: "/playgrounds/local-only",
  },
  {
    name: "Sync",
    description: "Keep syncing through relay outages with independent backups.",
    href: "/playgrounds/sync",
  },
  {
    name: "Full-Featured",
    description: "A playground with many features.",
    href: "/playgrounds/full",
  },
  {
    name: "Multitenant",
    description: "A playground demonstrating device and app-owner flows.",
    href: "/playgrounds/multitenant",
  },
];

export const Playgrounds: FC = () => (
  <div className="my-16 xl:max-w-none">
    <div className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-10 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:max-w-none xl:grid-cols-2 dark:border-white/5">
      {playgrounds.map((playground) => (
        <div key={playground.name} className="relative flex gap-6">
          <div className="flex-auto">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {playground.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {playground.description}
            </p>
            <p className="mt-4">
              <Button
                href={playground.href}
                target="_blank"
                variant="secondary"
              >
                Open Playground
              </Button>
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
);
