import { assert } from "@evolu/common";
import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FC, ReactNode } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  Features,
  LibraryFeatures,
  LocalFirstFeatures,
} from "@/components/Features";
import { Logo } from "@/components/Logo";
import { SnippetCodeGroup } from "@/components/SnippetCodeGroup";

const definition = "Evolu is a local-first platform and TypeScript library.";

export const metadata: Metadata = {
  title: { absolute: "Evolu" },
  description: `${definition} Its local-first platform is SQLite on every platform, synced end-to-end encrypted without an authoritative server.`,
};

// Non-breaking hyphens (U+2011) keep "end-to-end" on one line.
const platformDescription =
  "SQLite on every platform, synced end\u2011to\u2011end encrypted without an authoritative server. Relays, which you can host yourself, only store and pass on changes they can't read.";

const libraryDescription =
  "The library Evolu itself is built on, for any TypeScript project: Result for typed errors, Type for runtime validation, and Task for structured concurrency, in idiomatic TypeScript.";

const linkClassName =
  "font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition hover:decoration-zinc-500 dark:text-white dark:decoration-zinc-600 dark:hover:decoration-zinc-400";

const Section: FC<{ title: string; id?: string; children: ReactNode }> = ({
  title,
  id,
  children,
}) => (
  <section id={id} className="mx-auto mt-24 w-full max-w-3xl">
    <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
      {title}
    </h2>
    {children}
  </section>
);

const Lead: FC<{ children: ReactNode }> = ({ children }) => (
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

const Page: FC = async () => {
  // Homepage.test.ts bundles a sample of Types, Tasks, and logging and
  // measures it.
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
        {/* The gaps leave room for each card's hover background, which extends
            beyond its text. */}
        <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-12 text-left sm:grid-cols-2">
          <Card>
            <Card.Title href="#local-first-platform">
              Local-first platform
            </Card.Title>
            <Card.Description marginClassName="mt-4">
              {platformDescription}
            </Card.Description>
          </Card>
          <Card>
            <Card.Title href="#typescript-library">
              TypeScript library
            </Card.Title>
            <Card.Description marginClassName="mt-4">
              {libraryDescription}
            </Card.Description>
          </Card>
        </div>
      </section>

      <section className="mx-auto mt-16 w-full max-w-3xl">
        <h2 className="sr-only">Simple, strict, secure, honest</h2>
        <Features />
      </section>

      <Section title="Local-first platform" id="local-first-platform">
        <SnippetCodeGroup
          snippets={[
            { title: "Schema and queries", file: "data.ts" },
            { title: "Sync and mutations", file: "sync.ts" },
          ]}
        />
        <Lead>
          Apps that keep data on their servers stop working offline, make users
          wait on spinners, and take their data with them when the company
          behind them changes its plans. Local&#8209;first apps read and write
          on the device, so they respond instantly, work offline, and keep
          working for as long as their users need them.
        </Lead>
        <div className="mt-8">
          <LocalFirstFeatures />
        </div>
        <div className="mt-8">
          <Button href="/docs/local-first" arrow="right">
            Get started with local&#8209;first
          </Button>
        </div>
      </Section>

      <Section title="TypeScript library" id="typescript-library">
        <SnippetCodeGroup
          snippets={[
            { title: "Typed errors", file: "errors.ts" },
            { title: "Branded types", file: "brands.ts" },
            { title: "Type boundaries", file: "boundaries.ts" },
            { title: "Tasks", file: "concurrency.ts" },
            { title: "Fails fast", file: "strict.ts" },
          ]}
        />
        <Lead>
          It&apos;s written test&#8209;first: its tests are the runnable
          specification, and most modules have full test coverage. The source
          and unit tests ship in the npm package, and every example in its API
          reference is type&#8209;checked and run, so developers and agents
          learn from verified code.
        </Lead>
        <div className="mt-8">
          <LibraryFeatures bundleSize={taskBundleSize} />
        </div>
        <div className="mt-8">
          <Button href="/docs/library" arrow="right">
            Get started with the library
          </Button>
        </div>
      </Section>

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

      <Section title="Made by Daniel Steigerwald">
        <Lead>
          When I started Evolu, I knew I didn&apos;t know everything, so I built
          on popular functional programming libraries. That was a compromise,
          because depending on code I don&apos;t understand is a kind of vendor
          lock&#8209;in too. So I wrote my own TypeScript library. For
          structured concurrency and resource management, I studied how other
          languages, frameworks, and libraries handle them. It was an incredible
          journey, and I stand behind how Evolu works today.
        </Lead>
        <Lead>
          I&apos;ve also learned that tests can show bugs but never prove their
          absence. Formal verification can, so future versions of Evolu will be
          formally verified.
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
};

export default Page;
