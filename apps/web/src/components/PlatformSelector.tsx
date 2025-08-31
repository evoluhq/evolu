"use client";

import { usePreferredLanguageStore } from "@/components/Code";
import { ReactLogo } from "@/components/icons/frameworks/React";
import { ExpoLogo } from "@/components/icons/frameworks/Expo";
import { SvelteLogo } from "@/components/icons/frameworks/Svelte";
import { JavaScriptLogo } from "@/components/icons/frameworks/JavaScript";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

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

export function PlatformSelector(): React.ReactElement {
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
    <fieldset className="mb-6">
      <legend className="text-sm/6 font-semibold">Choose a platform</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const IconComponent = platform.icon;
          return (
            <label
              key={platform.id}
              aria-label={platform.title}
              className="group relative flex rounded-lg border border-zinc-300 bg-white px-3 py-2 hover:border-zinc-400 hover:bg-zinc-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-100 has-[:checked]:outline-2 has-[:checked]:-outline-offset-2 has-[:checked]:outline-blue-500 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-1 has-[:focus-visible]:outline-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 dark:has-[:checked]:border-blue-400 dark:has-[:checked]:bg-blue-900/50"
            >
              <input
                value={platform.id}
                checked={currentPlatform === platform.id}
                name="platform"
                type="radio"
                onChange={(e) => {
                  handlePlatformChange(e.target.value);
                }}
                className="absolute inset-0 appearance-none focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <IconComponent className="size-4 text-zinc-600 group-has-[:checked]:text-blue-700 dark:text-zinc-400 dark:group-has-[:checked]:text-blue-200" />
                <span className="text-sm font-medium text-zinc-900 group-has-[:checked]:text-blue-800 dark:text-zinc-100 dark:group-has-[:checked]:text-blue-100">
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
