"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";

const ThemeWatcher = () => {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const onMediaChange = () => {
      const systemTheme = media.matches ? "dark" : "light";
      if (resolvedTheme === systemTheme) {
        setTheme("system");
      }
    };

    onMediaChange();
    media.addEventListener("change", onMediaChange);

    return () => {
      media.removeEventListener("change", onMediaChange);
    };
  }, [resolvedTheme, setTheme]);

  return null;
};

export const Providers = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    disableTransitionOnChange
  >
    <ThemeWatcher />
    {children}
  </ThemeProvider>
);
