const allBrowserNames = ["chromium", "firefox", "webkit"] as const;

type BrowserName = (typeof allBrowserNames)[number];

interface BrowserInstance {
  readonly browser: BrowserName;
}

// V8 coverage only works with Chromium.
const chromiumBrowserNames: ReadonlyArray<BrowserName> = ["chromium"];

const browserNamesByMode: Readonly<
  Record<string, ReadonlyArray<BrowserName> | undefined>
> = {
  firefox: ["firefox"],
  webkit: ["webkit"],
  "firefox-webkit": ["firefox", "webkit"],
};

export const createBrowserInstances = ({
  coverage,
  mode,
}: {
  readonly coverage: boolean;
  readonly mode: string;
}): Array<BrowserInstance> =>
  (coverage
    ? chromiumBrowserNames
    : (browserNamesByMode[mode] ?? allBrowserNames)
  ).map((browser) => ({ browser }));
