"use client";

import clsx from "clsx";
import { motion, MotionStyle, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { forwardRef, Suspense, useEffect, useRef } from "react";

import { DiscordIcon, GitHubIcon, SocialLink } from "@/components/Footer";
import { Logo } from "@/components/Logo";

import { MobileSearch, Search } from "@/components/Search";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconArrowUpRight } from "@tabler/icons-react";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from "@headlessui/react";
import { usePathname, useSearchParams } from "next/navigation";

import { Navigation } from "@/components/Navigation";
import {
  IsInsideMobileNavigationContext,
  useIsInsideMobileNavigation,
  useMobileNavigationStore,
} from "@/hooks/use-nav";

function TopLevelNavItem({
  href,
  target = "_self",
  children,
}: {
  href: string;
  target?: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        target={target}
        className="flex items-center text-sm leading-5 text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white [&>svg]:ml-0.5 [&>svg]:size-3 [&>svg]:stroke-1 [&>svg]:text-gray-400"
      >
        {children}
      </Link>
    </li>
  );
}

function MenuIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 10 9"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M.5 1h9M.5 8h9M.5 4.5h9" />
    </svg>
  );
}

function XIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M11.1527 8.92804L16.2525 3H15.044L10.6159 8.14724L7.07919 3H3L8.34821 10.7835L3 17H4.20855L8.88474 11.5643L12.6198 17H16.699L11.1524 8.92804H11.1527ZM9.49748 10.8521L8.95559 10.077L4.644 3.90978H6.50026L9.97976 8.88696L10.5216 9.66202L15.0446 16.1316H13.1883L9.49748 10.8524V10.8521Z" />
    </svg>
  );
}

function XCloseIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 10 9"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m1.5 1 7 7M8.5 1l-7 7" />
    </svg>
  );
}

function MobileNavigationDialog({
  isOpen,
  close,
}: {
  isOpen: boolean;
  close: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialPathname = useRef(pathname);
  const initialSearchParams = useRef(searchParams);

  useEffect(() => {
    if (
      pathname !== initialPathname.current ||
      searchParams !== initialSearchParams.current
    ) {
      close();
    }
  }, [pathname, searchParams, close, initialPathname, initialSearchParams]);

  function onClickDialog(event: React.MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    const link = event.target.closest("a");
    if (
      link &&
      link.pathname + link.search + link.hash ===
        window.location.pathname + window.location.search + window.location.hash
    ) {
      close();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClickCapture={onClickDialog}
      onClose={close}
      className="fixed inset-0 z-50 lg:hidden"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 top-14 bg-zinc-400/20 backdrop-blur-xs data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-black/40"
      />

      <DialogPanel>
        <TransitionChild>
          <Header className="data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in" />
        </TransitionChild>

        <TransitionChild>
          <motion.div
            layoutScroll
            className="fixed top-14 bottom-0 left-0 w-full overflow-y-auto bg-white px-4 pt-6 pb-4 shadow-lg ring-1 shadow-zinc-900/10 ring-zinc-900/7.5 duration-500 ease-in-out data-closed:-translate-x-full min-[416px]:max-w-sm sm:px-6 sm:pb-10 dark:bg-zinc-900 dark:ring-zinc-800"
          >
            <Navigation />
          </motion.div>
        </TransitionChild>
      </DialogPanel>
    </Dialog>
  );
}

export function MobileNavigation(): React.ReactElement {
  const isInsideMobileNavigation = useIsInsideMobileNavigation();
  const { isOpen, toggle, close } = useMobileNavigationStore();
  const ToggleIcon = isOpen ? XCloseIcon : MenuIcon;

  return (
    <IsInsideMobileNavigationContext.Provider value={true}>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-zinc-900/5 dark:hover:bg-white/5"
        aria-label="Toggle navigation"
        onClick={toggle}
      >
        <ToggleIcon className="w-2.5 stroke-zinc-900 dark:stroke-white" />
      </button>
      {!isInsideMobileNavigation && (
        <Suspense fallback={null}>
          <MobileNavigationDialog isOpen={isOpen} close={close} />
        </Suspense>
      )}
    </IsInsideMobileNavigationContext.Provider>
  );
}

export const Header = forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<typeof motion.div> & {
    variant?: "landing" | "docs";
  }
>(function Header({ className, variant = "docs", ...props }, ref) {
  const { isOpen: mobileNavIsOpen } = useMobileNavigationStore();
  const isInsideMobileNavigation = useIsInsideMobileNavigation();

  const pathname = usePathname();

  const { scrollY } = useScroll();
  const bgOpacityLight = useTransform(scrollY, [0, 72], [0.5, 0.9]);
  const bgOpacityDark = useTransform(scrollY, [0, 72], [0.2, 0.8]);

  return (
    <motion.div
      {...props}
      ref={ref}
      className={clsx(
        className,
        "fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-12 px-4 transition sm:px-6 lg:left-72 lg:z-30 lg:px-8 xl:left-80",
        !isInsideMobileNavigation &&
          "backdrop-blur-xs lg:left-72 xl:left-80 dark:backdrop-blur-sm",
        isInsideMobileNavigation
          ? "bg-white dark:bg-zinc-900"
          : "bg-white/(--bg-opacity-light) dark:bg-zinc-900/(--bg-opacity-dark)",

        variant === "landing" &&
          "mx-auto md:px-3! lg:left-0! lg:px-8! xl:left-0! xl:max-w-5xl",
        variant === "docs" && "bg-white! dark:bg-zinc-900!",
      )}
      style={
        {
          "--bg-opacity-light": bgOpacityLight,
          "--bg-opacity-dark": bgOpacityDark,
        } as MotionStyle
      }
    >
      <div
        className={clsx(
          "absolute inset-x-0 top-full h-px transition",
          (isInsideMobileNavigation || !mobileNavIsOpen) &&
            "bg-zinc-900/7.5 dark:bg-white/7.5",
          variant === "landing" && "hidden!",
        )}
      />
      <Search />
      <div className="flex items-center gap-5 lg:hidden">
        <MobileNavigation />
        <Link href="/" aria-label="Home">
          <Logo className="h-4" />
        </Link>
      </div>
      <div className="flex items-center gap-5">
        <nav className="hidden md:block">
          <ul role="list" className="flex items-center gap-8">
            {pathname === "/" && (
              <TopLevelNavItem href="/docs/quickstart">Docs</TopLevelNavItem>
            )}
            {pathname.startsWith("/blog") && (
              <>
                <TopLevelNavItem href="/">Evolu</TopLevelNavItem>
                <TopLevelNavItem href="/docs/quickstart">Docs</TopLevelNavItem>
              </>
            )}
            <TopLevelNavItem href="/blog">Blog</TopLevelNavItem>
            <TopLevelNavItem
              target="_blank"
              href="https://github.com/evoluhq/evolu/releases"
            >
              Changelog <IconArrowUpRight />
            </TopLevelNavItem>
            <div className="flex items-center gap-3">
              <SocialLink
                href="https://github.com/evoluhq/evolu"
                icon={GitHubIcon}
              >
                Follow us on GitHub
              </SocialLink>
              <SocialLink href="https://x.com/evoluhq" icon={XIcon}>
                Follow us on X
              </SocialLink>
              <SocialLink
                href="https://discord.gg/2J8yyyyxtZ"
                icon={DiscordIcon}
              >
                Join our Discord server
              </SocialLink>
            </div>
          </ul>
        </nav>
        <div className="hidden md:block md:h-5 md:w-px md:bg-zinc-900/10 md:dark:bg-white/15" />
        <div className="flex gap-4">
          <MobileSearch />
          <ThemeToggle />
        </div>
      </div>
    </motion.div>
  );
});
