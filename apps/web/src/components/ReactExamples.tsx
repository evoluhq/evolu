import { Button } from "@/components/Button";
import { ElectronLogo } from "@/components/icons/frameworks/Electron";
import { ExpoLogo } from "@/components/icons/frameworks/Expo";
import { NextjsLogo } from "@/components/icons/frameworks/Nextjs";
import ViteLogo from "@/components/icons/frameworks/Vite";

const examples = [
  {
    demo: "/docs/examples/react/nextjs",
    repo: "https://github.com/evoluhq/evolu/tree/main/examples/react-nextjs",
    name: "Next.js",
    description: "Example usage of Next.js with Evolu.",
    logo: NextjsLogo,
  },
  {
    repo: "https://github.com/evoluhq/evolu/tree/main/apps/expo",
    name: "Expo",
    description: "Evolu on mobile with Expo.",
    logo: ExpoLogo,
  },
  {
    repo: "https://github.com/evoluhq/evolu/tree/main/examples/react-vite-pwa",
    name: "Vite + React + PWA",
    description: "Offline support, installable on mobile.",
    logo: ViteLogo,
  },
  {
    repo: "https://github.com/evoluhq/evolu/tree/main/examples/react-electron",
    name: "Electron",
    description: "Desktop app with Electron.",
    logo: ElectronLogo,
  },
];

export function ReactExamples(): React.ReactElement {
  return (
    <div className="my-16 xl:max-w-none">
      <div className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-10 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:max-w-none xl:grid-cols-2 dark:border-white/5">
        {examples.map((example) => (
          <div key={example.name} className="relative flex gap-6">
            <div className="flex-auto pl-12">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                {example.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {example.description}
              </p>
              <p className="mt-4 flex items-center gap-3">
                {/* {example.demo && (
                  <Button
                    href={example.demo}
                    target="_self"
                    variant="secondary"
                  >
                    Demo
                  </Button>
                )} */}
                {example.repo && (
                  <Button href={example.repo} target="_blank" variant="text">
                    Go to repository
                  </Button>
                )}
              </p>
            </div>
            <example.logo className="absolute top-0 size-6 dark:text-white" />
          </div>
        ))}
      </div>
    </div>
  );
}
