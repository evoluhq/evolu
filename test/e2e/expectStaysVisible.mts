import { expect, type Locator } from "playwright/test";

interface VisibilityMonitor {
  readonly stop: () => ReadonlyArray<string>;
}

/**
 * Runs `body` while recording even brief hiding or removal of the located
 * element or its ancestors, then fails with `description` if anything was
 * recorded. An error thrown by `body` takes precedence.
 */
export const expectStaysVisible = async (
  locator: Locator,
  description: string,
  body: () => Promise<void>,
): Promise<void> => {
  const monitor = await locator.evaluateHandle((input): VisibilityMonitor => {
    const ancestors = new Set<Node>();
    for (let node: Node | null = input; node !== null; node = node.parentNode) {
      ancestors.add(node);
    }
    const interruptions: Array<string> = [];
    const previousStyle = document.createElement("div").style;

    const recordChanges = (records: ReadonlyArray<MutationRecord>) => {
      for (const record of records) {
        if (record.type === "childList") {
          for (const node of record.removedNodes) {
            if (ancestors.has(node) || node.contains(input)) {
              interruptions.push("Loaded content was removed");
            }
          }
          continue;
        }

        const target = record.target;
        if (!(target instanceof HTMLElement) || !ancestors.has(target)) {
          continue;
        }
        if (
          record.attributeName === "hidden" &&
          (record.oldValue !== null || target.hasAttribute("hidden"))
        ) {
          interruptions.push("Loaded content was hidden");
        }
        if (record.attributeName === "style") {
          // React hides suspended content with display:none. Inspect the old
          // value too: hiding and restoring can happen in one observer batch.
          previousStyle.cssText = record.oldValue ?? "";
          if (
            previousStyle.display === "none" ||
            target.style.display === "none"
          ) {
            interruptions.push("Loaded content entered display:none");
          }
        }
      }
    };

    const observer = new MutationObserver(recordChanges);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "hidden"],
      attributeOldValue: true,
    });
    return {
      stop: () => {
        recordChanges(observer.takeRecords());
        observer.disconnect();
        return interruptions;
      },
    };
  });

  let interruptions: ReadonlyArray<string> = [];
  try {
    await body();
  } finally {
    try {
      interruptions = await monitor.evaluate((visibilityMonitor) =>
        visibilityMonitor.stop(),
      );
      await monitor.dispose();
    } catch (error) {
      interruptions = [`Visibility monitor failed: ${String(error)}`];
    }
  }
  expect(interruptions, description).toEqual([]);
};
