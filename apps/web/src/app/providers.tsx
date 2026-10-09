"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";

// ThemeToggle stores the opposite of the shown theme, an override of the
// system theme. Whenever the shown theme matches the system theme, after a
// second press, on load, or after an automatic OS switch, the override is
// cleared so the site follows the system again. People press the toggle
// because the page looks wrong right now, so a dark override made during the
// day should not keep the site dark the next morning. This deliberately differs
// from https://lea.verou.me/blog/2026/dark-mode-toggles/, which keeps the
// override until the next press.
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
