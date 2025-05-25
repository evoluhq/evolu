import { type Metadata } from "next";

import { Providers } from "@/app/providers";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import LetterGlitch from "@/components/LetterGlitch";
import "@/styles/tailwind.css";

export const metadata: Metadata = {
  title: {
    template: "%s - Evolu",
    default:
      "Local-First Platform Designed for Privacy, Ease of Use, and No Vendor Lock-In",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Providers>
      <LetterGlitch
        className="pointer-events-none !fixed inset-0 z-[-1] transform-gpu opacity-[0.13] transition-opacity duration-300 dark:opacity-[0.05]"
        glitchSpeed={50}
        centerVignette={false}
        outerVignette={true}
        smooth={true}
      />
      <div className="mx-auto h-full max-w-5xl">
        <Header variant="landing" />

        <div className="relative flex h-full flex-col px-4 pt-14 sm:px-6 lg:px-8">
          <main className="flex-auto">{children}</main>
          <Footer />
        </div>
      </div>
    </Providers>
  );
}
