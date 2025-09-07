import { NextJsPlaygroundFull } from "@/components/NextJsPlaygroundFull";

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <NextJsPlaygroundFull />
    </div>
  );
}
