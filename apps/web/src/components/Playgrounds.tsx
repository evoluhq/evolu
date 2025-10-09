import { Button } from "@/components/Button";

const playgrounds = [
  {
    name: "Minimal",
    description: "A simple playground to get started with Evolu.",
    href: "/playgrounds/minimal",
  },
  {
    name: "Full-Featured",
    description: "A comprehensive playground with advanced features.",
    href: "/playgrounds/full",
  },
];

export function Playgrounds(): React.ReactElement {
  return (
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
}
