type BrowserName = "chromium" | "firefox" | "webkit";

interface BrowserInstance {
  readonly browser: BrowserName;
}

// V8 coverage only works with Chromium.
const chromiumBrowserNames: ReadonlyArray<BrowserName> = ["chromium"];
const compatibilityBrowserNames: ReadonlyArray<BrowserName> = [
  "firefox",
  "webkit",
];

const browserNamesByMode: Readonly<
  Record<string, ReadonlyArray<BrowserName> | undefined>
> = {
  chromium: ["chromium"],
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
    : (browserNamesByMode[mode] ?? compatibilityBrowserNames)
  ).map((browser) => ({ browser }));
