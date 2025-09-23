import dynamic from "next/dynamic";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export default function noSsr(component: any): any {
  return dynamic(() => Promise.resolve(component), { ssr: false });
}
