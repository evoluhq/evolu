import { NextJsPlaygroundMinimal } from "@/components/NextJsPlaygroundMinimal";

export default function Page(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <NextJsPlaygroundMinimal />
    </div>
  );
}
