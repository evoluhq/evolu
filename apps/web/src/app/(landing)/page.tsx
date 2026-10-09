import { assert } from "@evolu/common";
import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Button } from "@/components/Button";
import { Features, LibraryFeatures } from "@/components/Features";
import { Logo } from "@/components/Logo";
import { SnippetCodeGroup } from "@/components/SnippetCodeGroup";

const definition =
  "Evolu is a local-first platform. Apps store data in SQLite on each device and sync it end-to-end encrypted through relays you can host yourself.";

export const metadata: Metadata = {
  title: { absolute: "Evolu" },
  description: definition,
};

const linkClassName =
  "font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition hover:decoration-zinc-500 dark:text-white dark:decoration-zinc-600 dark:hover:decoration-zinc-400";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="mx-auto mt-24 w-full max-w-3xl">
    <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
      {title}
    </h2>
    {children}
  </section>
);

const Facts = ({ children }: { children: React.ReactNode }) => (
  <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
    {children}
  </dl>
);

const Fact = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div>
    <dt className="font-semibold text-zinc-900 dark:text-white">{title}</dt>
    <dd className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
      {children}
    </dd>
  </div>
);

const Lead = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">{children}</p>
);

const projects = [
  {
    name: "Trezor Suite",
    href: "https://github.com/trezor/trezor-suite",
    description:
      "SatoshiLabs integrates Evolu with local authentication backed by Trezor.",
    inProduction: true,
  },
  {
    name: "Linky",
    href: "https://linky.fit",
    description: "A Bitcoin wallet and messaging app in one.",
    inProduction: true,
  },
  {
    name: "Payky",
    href: "https://github.com/finitoapp/payky",
    description:
      "A local-first payment terminal for bank transfers, cash, and Bitcoin Lightning.",
    inProduction: false,
  },
];

export default async function Page(): Promise<React.ReactElement> {
  // Homepage.test.ts bundles src/homepage/task.ts and measures it.
  const bundleSnapshot = await readFile(
    join(process.cwd(), "../../test/bundle/Bundle/Homepage.test.ts.snapshot"),
    "utf8",
  );
  const taskBrotliBytes =
    /"vite@[^"]+": \{[^}]*"brotliSizeInBytes": (\d+)/u.exec(
      bundleSnapshot.slice(bundleSnapshot.indexOf('"Task"')),
    )?.[1];
  assert(taskBrotliBytes, "The Task bundle size is in the snapshot.");
  const taskBundleSize = `${(Number(taskBrotliBytes) / 1000).toFixed(1)} kB`;

  return (
    <div className="flex flex-col pt-16 pb-24">
      <section className="flex flex-col items-center gap-6 text-center">
        <Logo className="h-9 md:h-12 lg:h-14" />
        <h1 className="text-4xl font-bold tracking-tight text-balance text-zinc-900 sm:text-5xl dark:text-white">
          local&#8209;first all the things
        </h1>
        <p className="max-w-2xl text-lg text-balance text-zinc-600 dark:text-zinc-400">
          {definition}
        </p>
        <div className="flex justify-center gap-4">
          <Button href="/docs" arrow="right">
            Get started
          </Button>
          <Button href="/playgrounds/minimal" variant="outline">
            Playground
          </Button>
        </div>
        <p className="max-w-xl text-sm text-balance text-zinc-500 dark:text-zinc-400">
          Evolu Library is ready. Evolu local&#8209;first runs in production in{" "}
          <a href="https://trezor.io/trezor-suite" className={linkClassName}>
            Trezor Suite
          </a>
          ; general release is coming.
        </p>
      </section>

      <div className="mx-auto mt-6 w-full max-w-3xl">
        <SnippetCodeGroup
          snippets={[
            { title: "Your data", file: "data.ts" },
            { title: "Your sync", file: "sync.ts" },
            { title: "Your code", file: "task.ts" },
          ]}
        />
      </div>

      <section className="mt-16">
        <h2 className="sr-only">Simple, strict, secure, honest</h2>
        <Features />
      </section>

      <Section title="Built with Evolu">
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {projects.map((project) => (
            <li key={project.name}>
              <a href={project.href} className={linkClassName}>
                {project.name}
              </a>
              {project.inProduction ? (
                <span className="ml-2 rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-400/20 ring-inset dark:text-emerald-400">
                  In production
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-zinc-400/10 px-2 py-0.5 text-xs font-medium text-zinc-500 ring-1 ring-zinc-400/20 ring-inset dark:text-zinc-400">
                  In development
                </span>
              )}
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {project.description}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Local-first">
        <Lead>
          Local&#8209;first apps keep data on the user&apos;s device and use
          servers only to sync and back it up. They work offline, and users keep
          their data even when the company behind an app changes its plans. Read{" "}
          <Link
            href="/blog/why-the-world-needs-local-first-apps"
            className={linkClassName}
          >
            why the world needs local&#8209;first apps
          </Link>
          .
        </Lead>
        <Facts>
          <Fact title="SQLite everywhere">
            Browsers, React Native (Expo), and Electron, with React, Vue, and
            Svelte bindings. On the web, Evolu compiles{" "}
            <Link
              href="/blog/evolu-builds-its-own-sqlite"
              className={linkClassName}
            >
              plain SQLite
            </Link>{" "}
            from sqlite.org&apos;s source, checked against the hash sqlite.org
            publishes.
          </Fact>
          <Fact title="Type-safe SQL">
            Kysely queries whose results update when local or synced data
            changes.
          </Fact>
          <Fact title="Any schema library">
            Define columns with Evolu Type or any{" "}
            <Link href="/docs/schema" className={linkClassName}>
              Standard Schema
            </Link>{" "}
            library, such as Zod.
          </Fact>
          <Fact title="End-to-end encrypted">
            Relays store and forward encrypted changes they can&apos;t read. The{" "}
            <Link href="/docs/privacy" className={linkClassName}>
              privacy docs
            </Link>{" "}
            explain what relays can see.
          </Fact>
          <Fact title="Relays you can host">
            The{" "}
            <Link href="/docs/relay" className={linkClassName}>
              relay
            </Link>{" "}
            is MIT-licensed and self-hostable. Use several at once, so sync
            survives an outage.
          </Fact>
          <Fact title="History included">
            Every synced change is kept, so you can{" "}
            <Link href="/docs/time-travel" className={linkClassName}>
              travel in time
            </Link>
            . Devices converge deterministically, and the last writer wins per
            column.
          </Fact>
        </Facts>
        <div className="mt-8">
          <Button href="/docs/local-first" arrow="right">
            Get started with local&#8209;first
          </Button>
        </div>
      </Section>

      <Section title="Evolu Library">
        <Lead>
          The TypeScript library Evolu is built on, ready to use on its own.
          It&apos;s written test&#8209;first: its tests are the runnable
          specification, and most modules have full test coverage. The source
          and unit tests ship in the npm package, and every example in its API
          reference is type-checked and run, so developers and agents learn from
          verified code.
        </Lead>
        <div className="mt-8">
          <LibraryFeatures bundleSize={taskBundleSize} />
        </div>
        <SnippetCodeGroup
          snippets={[
            { title: "Branded types", file: "brands.ts" },
            { title: "Type boundaries", file: "boundaries.ts" },
            { title: "Tasks", file: "concurrency.ts" },
            { title: "Fails fast", file: "strict.ts" },
          ]}
        />
        <div className="mt-8">
          <Button href="/docs/library" arrow="right">
            Get started with the library
          </Button>
        </div>
      </Section>

      <Section title="Made by Daniel Steigerwald">
        <Lead>
          When I started Evolu, I knew I didn&apos;t know everything, so I built
          on popular functional programming libraries. That was a compromise,
          because depending on code I don&apos;t understand is a kind of vendor
          lock&#8209;in too. So I wrote Evolu Library. For structured
          concurrency and resource management, I studied how other languages,
          frameworks, and libraries handle them. It was an incredible journey,
          and I stand behind how Evolu works today.
        </Lead>
        <Lead>
          I&apos;ve also learned that tests can show bugs but never prove their
          absence. Formal verification can, so future versions of Evolu will be
          formally verified.
        </Lead>
        <Lead>
          Evolu is designed to fit in one developer&apos;s head: one author, one
          consistent design, and design decisions explained next to the code.
        </Lead>
        <Lead>
          <a
            href="https://github.com/sponsors/steida"
            className={linkClassName}
          >
            Sponsor on GitHub
          </a>
          {" · "}
          <Link
            href="/blog/scaling-local-first-software"
            className={linkClassName}
          >
            The story behind Evolu
          </Link>
        </Lead>
      </Section>

      <section className="mt-24 flex flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          Own your data. Own your apps.
        </h2>
        <div className="flex justify-center gap-4">
          <Button href="/docs" arrow="right">
            Get started
          </Button>
          <Button
            href="https://github.com/evoluhq/evolu"
            target="_blank"
            variant="outline"
            arrow="top-right"
          >
            GitHub
          </Button>
        </div>
      </section>
    </div>
  );
}
