import "@/styles/globals.css";
import type { AppProps } from "next/app";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
