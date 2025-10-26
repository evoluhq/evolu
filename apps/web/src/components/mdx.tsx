import clsx from "clsx";
import Link from "next/link";

import { Feedback } from "@/components/Feedback";
import { Heading } from "@/components/Heading";
import { Prose } from "@/components/Prose";

export const a = Link;
export { Announcement, InlineNote, Note, Warn } from "@/components/Alerts";
export { Button } from "@/components/Button";
export {
  Code as code,
  CodeGroup,
  SinglePlatformCodeGroup,
  Pre as pre,
} from "@/components/Code";
export { ConditionalPlatformAlert } from "@/components/ConditionalPlatformAlert";
export { PlatformSelector } from "@/components/PlatformSelector";

export function wrapper({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <Prose className="flex-auto">{children}</Prose>
      {/* TODO: feedback form? */}
      <footer className="mx-auto mt-16 hidden w-full max-w-2xl lg:max-w-5xl">
        <Feedback />
      </footer>
    </article>
  );
}

export const h2 = function H2(
  props: Omit<React.ComponentPropsWithoutRef<typeof Heading>, "level">,
): React.ReactElement {
  return <Heading level={2} {...props} />;
};

export function Row({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 items-start gap-x-16 gap-y-10 xl:max-w-none xl:grid-cols-2">
      {children}
    </div>
  );
}

export function Col({
  children,
  sticky = false,
}: {
  children: React.ReactNode;
  sticky?: boolean;
}): React.ReactElement {
  return (
    <div
      className={clsx(
        "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
        sticky && "xl:sticky xl:top-24",
      )}
    >
      {children}
    </div>
  );
}

export function Properties({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="my-6">
      <ul
        role="list"
        className="m-0 max-w-[calc(var(--container-lg)-(--spacing(8)))] list-none divide-y divide-zinc-900/5 p-0 dark:divide-white/5"
      >
        {children}
      </ul>
    </div>
  );
}

export function Property({
  name,
  children,
  type,
}: {
  name: string;
  children: React.ReactNode;
  type?: string;
}): React.ReactElement {
  return (
    <li className="m-0 px-0 py-4 first:pt-0 last:pb-0">
      <dl className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <dt className="sr-only">Name</dt>
        <dd>
          <code>{name}</code>
        </dd>
        {type && (
          <>
            <dt className="sr-only">Type</dt>
            <dd className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {type}
            </dd>
          </>
        )}
        <dt className="sr-only">Description</dt>
        <dd className="w-full flex-none [&>:first-child]:mt-0 [&>:last-child]:mb-0">
          {children}
        </dd>
      </dl>
    </li>
  );
}
