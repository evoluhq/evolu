import { type Metadata } from "next";
import type { FC, ReactNode } from "react";

import { Layout } from "@/components/Layout";

import "@/styles/tailwind.css";

export const metadata: Metadata = {
  title: {
    template: "%s - Evolu",
    default: "Local-first platform",
  },
};

const RootLayout: FC<{ children: ReactNode }> = ({ children }) => (
  <Layout>{children}</Layout>
);

export default RootLayout;
