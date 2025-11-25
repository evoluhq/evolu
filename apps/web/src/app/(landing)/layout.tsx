import { type Metadata } from "next";

import { Providers } from "@/app/providers";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "@/styles/tailwind.css";

export const metadata: Metadata = {
  title: {
    template: "%s - Evolu",
    default: "TypeScript library and local-first platform",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Providers>
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
