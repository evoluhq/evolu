import { Button } from "@/components/Button";

const NotFound = (): React.ReactElement => (
  <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
    <div className="rounded-full border border-zinc-200/70 bg-white/70 px-4 py-1 text-xs font-semibold tracking-[0.2em] text-zinc-700 uppercase shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
      404
    </div>
    <h1 className="mt-4 text-3xl font-semibold text-zinc-900 sm:text-4xl dark:text-white">
      Page not found
    </h1>
    <p className="mt-3 max-w-lg text-base text-zinc-600 dark:text-zinc-400">
      Sorry, we couldn’t find the page you’re looking for. The URL might be
      mistyped or the page may have moved.
    </p>
    <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
      <Button href="/docs" arrow="right">
        Back to docs
      </Button>
      <Button href="/docs/api-reference" variant="outline">
        API reference
      </Button>
    </div>
    <div className="mt-8 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
      <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800/60">
        Tip
      </span>
      <span>Use search to jump to a symbol.</span>
    </div>
  </div>
);

export default NotFound;
