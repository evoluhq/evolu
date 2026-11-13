import { Button } from "@/components/Button";
import type { FC } from "react";

const playgrounds = [
  {
    name: "Minimal",
    description: "The smallest Evolu app, with one account and no passkey.",
    href: "/playgrounds/minimal",
  },
  {
    name: "Full app",
    description:
      "Projects and todos, accounts, relays, and local data, with no passkey.",
    href: "/playgrounds/full/instant",
  },
  {
    name: "Full app with a passkey",
    description:
      "The same app, with a passkey that unlocks the accounts on this device.",
    href: "/playgrounds/full/passkey",
  },
];

export const Playgrounds: FC = () => (
  <div className="my-16 xl:max-w-none">
    <div className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-10 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:max-w-none xl:grid-cols-3 dark:border-white/5">
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
