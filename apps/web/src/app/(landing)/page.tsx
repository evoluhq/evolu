import { Button } from "@/components/Button";
import { Features } from "@/components/Features";
import { Guides } from "@/components/Guides";
import { HeroText } from "@/components/HeroText";
import { Logo } from "@/components/Logo";
import { InlineNote } from "@/components/mdx";
export const metadata = {
  title: "Evolu",
  description: "Privacy-focused local-first platform that scales.",
};

export default function Page(): React.ReactElement {
  return (
    <>
      <div className="flex flex-col gap-4 pt-14 xl:mx-auto xl:max-w-5xl">
        <Logo className="mx-auto h-9" />
        <HeroText className="text-center" />
        <div className="flex justify-center gap-5">
          <Button
            href="/docs/quickstart"
            arrow="right"
            className="scale-105 hover:scale-110"
          >
            Quickstart
          </Button>
        </div>

        <div className="flex justify-center">
          <InlineNote>
            Heads up: The new version of Evolu is now open-sourced but hasn’t
            been published to NPM yet.
            <br /> <br />
            If you're interested, feel free to ⭐️ star and 👀 watch the GitHub
            repo to be notified when it’s released.
          </InlineNote>
        </div>

        <Features />
        <Guides className="!mt-10" />
      </div>
    </>
  );
}
