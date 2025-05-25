export function HeroPattern(): React.ReactElement {
  return (
    <div className="pointer-events-none inset-0 z-[-1] mx-0 hidden max-w-none overflow-hidden md:hidden">
      <div className="absolute top-[-14.5px] left-1/2 ml-[-41.5rem] h-[25rem] w-[80rem] dark:[mask-image:linear-gradient(black,transparent)]">
        <div className="absolute inset-0 bg-linear-to-r from-zinc-400 to-zinc-100 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)] opacity-40 dark:from-zinc-500/30 dark:to-zinc-800/30 dark:opacity-100">
          <svg
            aria-hidden="true"
            className="absolute inset-x-0 -inset-y-1/2 h-[200%] w-full skew-x-[18deg] fill-white/10 stroke-transparent mix-blend-overlay dark:fill-black/20"
          >
            <defs>
              <pattern
                id=":S2:"
                width="72"
                height="56"
                patternUnits="userSpaceOnUse"
                x="-12"
                y="4"
              >
                <path d="M.5 56V.5H72" fill="none" />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="100%"
              strokeWidth="0"
              fill="url(#:S2:)"
            />
          </svg>
        </div>
        <svg
          viewBox="0 0 1113 440"
          aria-hidden="true"
          className="absolute top-0 left-1/2 ml-[-19rem] w-[69.5625rem] fill-white blur-[26px] dark:fill-zinc-900"
        >
          <path d="M.016 439.5s-9.5-300 434-300S882.516 20 882.516 20V0h230.004v439.5H.016Z" />
        </svg>
      </div>
    </div>
  );
}
