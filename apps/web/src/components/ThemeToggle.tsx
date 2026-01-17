import { IconMoonFilled, IconSun } from "@tabler/icons-react";
import { useTheme } from "next-themes";

export const ThemeToggle = (): React.ReactElement => {
  const { resolvedTheme, setTheme } = useTheme();
  const otherTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-zinc-900/5 dark:hover:bg-white/5"
      aria-label="Toggle theme"
      onClick={() => {
        setTheme(otherTheme);
      }}
    >
      <IconSun className="size-4 stroke-zinc-900 dark:hidden" />
      <IconMoonFilled className="hidden size-4 stroke-white dark:block" />
    </button>
  );
};
