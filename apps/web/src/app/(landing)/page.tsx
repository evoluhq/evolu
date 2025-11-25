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
      <div className="flex flex-col gap-4 pt-14 xl:mx-auto xl:max-w-5xl">
        <Logo className="mx-auto h-9" />
        <p className="lead w-full text-center text-balance">
          TypeScript library and local&#8209;first platform
        </p>
        <div className="flex justify-center gap-5">
          <Button
            href="/docs"
            arrow="right"
            className="scale-105 hover:scale-110"
          >
            Get started
          </Button>
        </div>

        <Features />
      </div>
    </>
  );
}
