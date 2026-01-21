import {
  IconExclamationCircleFilled,
  IconInfoCircleFilled,
} from "@tabler/icons-react";

export const Note = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => (
  <div className="my-6 flex gap-2.5 rounded-2xl border border-yellow-600/20 bg-yellow-50/50 p-4 leading-6 text-blue-900 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-zinc-100 [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-700 dark:[&_a]:text-blue-300 dark:hover:[&_a]:text-blue-200">
    <IconInfoCircleFilled className="mt-0.5 size-5 flex-none text-yellow-500 dark:text-yellow-500" />
    <div className="*:first:mt-0 *:last:mb-0">{children}</div>
  </div>
);

export const InlineNote = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => (
  <div className="my-6 inline-flex w-fit gap-2.5 rounded-2xl border border-yellow-600/20 bg-yellow-50/50 p-4 leading-6 text-blue-900 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-zinc-100 [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-700 dark:[&_a]:text-blue-300 dark:hover:[&_a]:text-blue-200">
    <IconInfoCircleFilled className="mt-0.5 size-5 flex-none text-yellow-500 dark:text-yellow-500" />
    <div className="max-w-md *:first:mt-0 *:last:mb-0">{children}</div>
  </div>
);

export const Warn = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => (
  <div className="my-6 flex gap-2.5 rounded-2xl border border-red-500/20 bg-red-50/50 p-4 leading-6 text-red-900 dark:border-red-500/30 dark:bg-red-500/5 dark:text-zinc-100 [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-700 dark:[&_a]:text-blue-300 dark:hover:[&_a]:text-blue-200">
    <IconExclamationCircleFilled className="mt-0.5 size-5 flex-none fill-red-500 dark:fill-red-200" />
    <div className="*:first:mt-0 *:last:mb-0">{children}</div>
  </div>
);

export const Announcement = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => (
  <div className="my-6 flex gap-2.5 rounded-2xl border border-black/20 bg-black p-4 leading-6 text-white dark:border-white/20 dark:bg-white dark:text-black dark:[--tw-prose-links-hover:var(--color-zinc-700)] dark:[--tw-prose-links:var(--color-zinc-900)]">
    <IconExclamationCircleFilled className="mt-0.5 size-5 flex-none fill-white dark:fill-black" />
    <div className="*:first:mt-0 *:last:mb-0">{children}</div>
  </div>
);
