type BrowserName = "chromium" | "firefox" | "webkit";

interface BrowserInstance {
  readonly browser: BrowserName;
}

const browserNamesByMode: ReadonlyMap<
  string,
  ReadonlyArray<BrowserName>
> = new Map([
  // The mode of `vitest` and `vitest run` when --mode is omitted.
  ["test", ["chromium", "firefox", "webkit"]],
  ["chromium", ["chromium"]],
  ["firefox", ["firefox"]],
  ["webkit", ["webkit"]],
  ["firefox-webkit", ["firefox", "webkit"]],
]);

// V8 coverage only works with Chromium.
const coverageBrowserNames: ReadonlyArray<BrowserName> = ["chromium"];

export const createBrowserInstances = ({
  coverage,
  mode,
}: {
  readonly coverage: boolean;
  readonly mode: string;
}): Array<BrowserInstance> => {
  const browserNames = browserNamesByMode.get(mode);
  if (!browserNames)
    throw new Error(
      `Unknown Vitest mode "${mode}" for browser projects. Expected one of: ${[...browserNamesByMode.keys()].join(", ")}. Without --mode, vitest and vitest run use "test".`,
    );
  return (coverage ? coverageBrowserNames : browserNames).map((browser) => ({
    browser,
  }));
};
