import clsx from "clsx";
import Link from "next/link";
import type { FC, ReactNode } from "react";

import { Heading } from "@/components/Heading";
import { LlmLink } from "@/components/LlmLink";
import { Prose } from "@/components/Prose";

export const a = Link;
export { Announcement, InlineNote, Note, Warn } from "@/components/Alerts";
export { Button } from "@/components/Button";
export {
  Code as code,
  CodeGroup,
  Pre as pre,
  SinglePlatformCodeGroup,
} from "@/components/Code";
export { ConditionalPlatformAlert } from "@/components/ConditionalPlatformAlert";
export { PlatformSelector } from "@/components/PlatformSelector";

export const wrapper: FC<{ children: ReactNode }> = ({ children }) => (
  <article className="flex h-full flex-col pt-16 pb-10">
    <Prose className="flex-auto">{children}</Prose>
    <LlmLink />
  </article>
);

export const h2: FC<
  Omit<React.ComponentPropsWithoutRef<typeof Heading>, "level">
> = (props) => <Heading level={2} {...props} />;

export const Row: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 items-start gap-x-16 gap-y-10 xl:max-w-none xl:grid-cols-2">
    {children}
  </div>
);

export const Col: FC<{ sticky?: boolean; children: ReactNode }> = ({
  children,
  sticky = false,
}) => (
  <div
    className={clsx(
      "*:first:mt-0 *:last:mb-0",
      sticky && "xl:sticky xl:top-24",
    )}
  >
    {children}
  </div>
);

export const Properties: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="my-6">
    <ul
      role="list"
      className="m-0 max-w-[calc(var(--container-lg)-(--spacing(8)))] list-none divide-y divide-zinc-900/5 p-0 dark:divide-white/5"
    >
      {children}
    </ul>
  </div>
);

export const Property: FC<{
  name: string;
  type?: string;
  children: ReactNode;
}> = ({ name, children, type }) => (
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
      <dd className="w-full flex-none *:first:mt-0 *:last:mb-0">{children}</dd>
    </dl>
  </li>
);
