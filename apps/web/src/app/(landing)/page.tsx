import { Button } from "@/components/Button";
import { Features } from "@/components/Features";
import { Logo } from "@/components/Logo";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evolu",
  description: "TypeScript library and local-first platform",
};

export default function Page(): React.ReactElement {
  return (
    <>
      <div className="flex flex-col gap-4 pt-16 md:gap-6 xl:mx-auto xl:max-w-5xl">
        <Logo className="mx-auto h-9 md:h-12 lg:h-14" />
        <p className="lead w-full text-center text-balance md:text-lg lg:text-xl">
          TypeScript library and local&#8209;first platform
        </p>
        <div className="flex justify-center gap-5 md:pt-2">
          <Button
            href="/docs"
            arrow="right"
            className="scale-105 hover:scale-110"
          >
            Get started
          </Button>
        </div>
        <Features />
        <p className="mx-auto max-w-2xl pt-6 pb-8 text-center text-lg text-zinc-600 md:text-xl dark:text-zinc-400">
          Own your apps and data.
          <br />
          Work offline, sync online.
          <br />
          No vendor lock&#8209;in.
          <sup>*</sup>
        </p>
        <p className="mx-auto -mt-4 max-w-2xl pb-8 text-center text-xs text-balance text-zinc-400 dark:text-zinc-500">
          *Of course, SQLite and Evolu are kind of lock&#8209;in, but
          replaceable because SQL is standard, and Evolu is just a thin layer on
          standard APIs.
        </p>
      </div>
    </>
  );
}
