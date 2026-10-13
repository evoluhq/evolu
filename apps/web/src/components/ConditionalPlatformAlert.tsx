"use client";

import type { FC, ReactNode } from "react";

import { Announcement, Note, Warn } from "@/components/Alerts";
import { usePreferredLanguageStore } from "@/components/Code";

type AlertType = "warning" | "info" | "announcement";

export const ConditionalPlatformAlert: FC<{
  platform: Array<string>;
  type?: AlertType;
  children: ReactNode;
}> = ({ platform, type = "warning", children }) => {
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
      return <Warn>{children}</Warn>;
  }
};
