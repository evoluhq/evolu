import { type Metadata } from "next";

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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full bg-white antialiased dark:bg-zinc-900">
        <div className="w-full">{children}</div>
      </body>
    </html>
  );
}
