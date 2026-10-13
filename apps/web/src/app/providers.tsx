"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { type FC, type ReactNode, useEffect } from "react";

// ThemeToggle stores the opposite of the shown theme, an override of the
// system theme. Whenever the shown theme matches the system theme, after a
// second press, on load, or after an automatic OS switch, the override is
// cleared so the site follows the system again. People press the toggle
// because the page looks wrong right now, so a dark override made during the
// day is cleared once the site is open while the OS is dark, such as after the
// evening switch. If it isn't open then, as with a tab closed overnight, the
// override still shows the next morning. This deliberately differs
// from https://lea.verou.me/blog/2026/dark-mode-toggles/, which keeps the
// override until the next press.
const ThemeWatcher: FC = () => {
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

export const Providers: FC<{ children: ReactNode }> = ({ children }) => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    disableTransitionOnChange
  >
    <ThemeWatcher />
    {children}
  </ThemeProvider>
);
