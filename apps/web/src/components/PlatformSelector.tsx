"use client";

import { usePreferredLanguageStore } from "@/components/Code";
import { ExpoLogo } from "@/components/icons/frameworks/Expo";
import { JavaScriptLogo } from "@/components/icons/frameworks/JavaScript";
import { ReactLogo } from "@/components/icons/frameworks/React";
import { SvelteLogo } from "@/components/icons/frameworks/Svelte";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const platforms = [
  {
    id: "React",
    title: "React",
    icon: ReactLogo,
  },
  {
    id: "React Native",
    title: "React Native",
    icon: ReactLogo,
  },
  {
    id: "Expo",
    title: "Expo",
    icon: ExpoLogo,
  },
  {
    id: "Svelte",
    title: "Svelte",
    icon: SvelteLogo,
  },
  {
    id: "Vanilla JS",
    title: "Vanilla JS",
    icon: JavaScriptLogo,
  },
];

// Component with URL state - needs to be wrapped in Suspense
function PlatformSelectorWithURL(): React.ReactElement {
  const { preferredLanguages, addPreferredLanguage } =
    usePreferredLanguageStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Get platform from URL or fallback to store or default to React
  const urlPlatform = searchParams.get("platform");
  const storePlatform = preferredLanguages[preferredLanguages.length - 1];

  // Validate platform exists in our platforms list
  const validPlatforms = platforms.map((p) => p.id);
  const validUrlPlatform =
    urlPlatform && validPlatforms.includes(urlPlatform) ? urlPlatform : null;
  const validStorePlatform =
    storePlatform && validPlatforms.includes(storePlatform)
      ? storePlatform
      : null;

  const currentPlatform = validUrlPlatform ?? validStorePlatform ?? "React";

  // Sync URL with store on mount
  useEffect(() => {
    if (validUrlPlatform && validUrlPlatform !== validStorePlatform) {
      addPreferredLanguage(validUrlPlatform);
    } else if (!validUrlPlatform && validStorePlatform) {
      // Update URL with current store preference
      const params = new URLSearchParams(searchParams.toString());
      params.set("platform", validStorePlatform);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [
    validUrlPlatform,
    validStorePlatform,
    addPreferredLanguage,
    searchParams,
    router,
    pathname,
  ]);

  const handlePlatformChange = (platformId: string) => {
    // Update both store and URL
    addPreferredLanguage(platformId);

    const params = new URLSearchParams(searchParams.toString());
    params.set("platform", platformId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <PlatformSelectorUI
      currentPlatform={currentPlatform}
      onPlatformChange={handlePlatformChange}
    />
  );
}

// Fallback component without URL state
function PlatformSelectorFallback(): React.ReactElement {
  const { preferredLanguages, addPreferredLanguage } =
    usePreferredLanguageStore();

  const currentPlatform =
    preferredLanguages[preferredLanguages.length - 1] ?? "React";

  const handlePlatformChange = (platformId: string) => {
    addPreferredLanguage(platformId);
  };

  return (
    <PlatformSelectorUI
      currentPlatform={currentPlatform}
      onPlatformChange={handlePlatformChange}
    />
  );
}

// Shared UI component
function PlatformSelectorUI({
  currentPlatform,
  onPlatformChange,
}: {
  currentPlatform: string;
  onPlatformChange: (platformId: string) => void;
}): React.ReactElement {
  return (
    <fieldset className="mb-6">
      <legend className="text-sm/6 font-semibold">Choose a platform</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const IconComponent = platform.icon;
          return (
            <label
              key={platform.id}
              aria-label={platform.title}
              className="group relative flex rounded-lg border border-zinc-300 bg-white px-3 py-2 hover:border-zinc-400 hover:bg-zinc-50 has-checked:border-blue-500 has-checked:bg-blue-100 has-checked:outline-2 has-checked:-outline-offset-2 has-checked:outline-blue-500 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 dark:has-checked:border-blue-400 dark:has-checked:bg-blue-900/50"
            >
              <input
                value={platform.id}
                checked={currentPlatform === platform.id}
                name="platform"
                type="radio"
                onChange={(e) => {
                  onPlatformChange(e.target.value);
                }}
                className="hidden"
              />
              <div className="flex items-center gap-1.5">
                <IconComponent className="size-4 text-zinc-600 group-has-checked:text-blue-700 dark:text-zinc-400 dark:group-has-checked:text-blue-200" />
                <span className="text-sm font-medium text-zinc-900 group-has-checked:text-blue-800 dark:text-zinc-100 dark:group-has-checked:text-blue-100">
                  {platform.title}
                </span>
              </div>
            </label>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        This selection will apply to all code examples on this page.
      </div>
    </fieldset>
  );
}

// Main export with Suspense boundary
export function PlatformSelector(): React.ReactElement {
  return (
    <Suspense fallback={<PlatformSelectorFallback />}>
      <PlatformSelectorWithURL />
    </Suspense>
  );
}
