"use client";

import { Announcement, Note, Warn } from "@/components/Alerts";
import { usePreferredLanguageStore } from "@/components/Code";

type AlertType = "warning" | "info" | "announcement";

export function ConditionalPlatformAlert({
  platform,
  type = "warning",
  children,
}: {
  platform: Array<string>;
  type?: AlertType;
  children: React.ReactNode;
}): React.ReactElement | null {
  const { preferredLanguages } = usePreferredLanguageStore();

  const mostRecentPlatform = preferredLanguages[preferredLanguages.length - 1];
  const shouldShow = platform.includes(mostRecentPlatform);

  if (!shouldShow) {
    return null;
  }

  switch (type) {
    case "info":
      return <Note>{children}</Note>;
    case "announcement":
      return <Announcement>{children}</Announcement>;
    case "warning":
    default:
      return <Warn>{children}</Warn>;
  }
}
