import clsx from "clsx";
import Link from "next/link";

import { Feedback } from "@/components/Feedback";
import { Heading } from "@/components/Heading";
import { Prose } from "@/components/Prose";
import {
  IconExclamationCircleFilled,
  IconInfoCircleFilled,
} from "@tabler/icons-react";

export const a = Link;
export { Button } from "@/components/Button";
export { Code as code, CodeGroup, Pre as pre } from "@/components/Code";

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

export function Note({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-yellow-600/20 bg-yellow-50/50 p-4 leading-6 text-blue-900 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-zinc-100 dark:[--tw-prose-links-hover:var(--color-blue-300)] dark:[--tw-prose-links:var(--color-white)]">
      <IconInfoCircleFilled className="mt-1 size-5 flex-none text-yellow-500 dark:text-yellow-500" />
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

export function InlineNote({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="my-6 inline-flex w-fit gap-2.5 rounded-2xl border border-yellow-600/20 bg-yellow-50/50 p-4 leading-6 text-blue-900 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-zinc-100 dark:[--tw-prose-links-hover:var(--color-blue-300)] dark:[--tw-prose-links:var(--color-white)]">
      <IconInfoCircleFilled className="mt-1 size-5 flex-none text-yellow-500 dark:text-yellow-500" />
      <div className="max-w-md [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

export function Warn({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-red-500/20 bg-red-50/50 p-4 leading-6 text-red-900 dark:border-red-500/30 dark:bg-red-500/5 dark:text-zinc-100 dark:[--tw-prose-links-hover:var(--color-blue-300)] dark:[--tw-prose-links:var(--color-white)]">
      <IconExclamationCircleFilled className="mt-1 size-5 flex-none fill-red-500 dark:fill-red-200" />
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

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
