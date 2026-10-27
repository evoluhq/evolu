/**
 * The entry of `@evolu/nodejs`'s addon, node/module.c, which the test addon
 * includes under other names, since node/addon.c is its entry: the Node-API
 * version it declares, the busy timeout it gives file connections, and how it
 * fails, also when one of its calls fails through the test addon's hooks of
 * node/test_hooks.h. In a file of its own, since the timeout is the process's
 * from the first initialization on.
 */
import {
  assertEqual,
  assertInstanceOf,
  assertSame,
  type NativeSqlite,
} from "@evolu/common";
import {
  createNativeSqliteRowBuilder,
  setupAddon,
} from "@evolu/sqlite-core/test/setup-addon.mts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const addon = await setupAddon();
const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-module-"));

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** What initializing `exports` did: what it returned, or the message it threw. */
const outcomeOf = (exports: object) => {
  try {
    return { returned: addon.initializeModule(exports) };
  } catch (error) {
    assertInstanceOf(error, Error);
    return { threw: error.message };
  }
};

/**
 * Initializes what `createExports` creates with each call failing in turn, from
 * the first, until a run makes no call fail, and returns what each run did.
 */
const failEachCall = (createExports: () => object) => {
  const outcomes = [];
  for (let index = 0; ; index++) {
    const exports = createExports();
    addon.failCall(index);
    const outcome = outcomeOf(exports);
    const isFailed = addon.callsLeft() === -1;
    addon.failCall(-1);
    outcomes.push(
      "returned" in outcome && outcome.returned === exports
        ? "exports"
        : outcome,
    );
    if (!isFailed) return outcomes;
  }
};

const failed = { threw: "Evolu's SQLite addon failed to initialize." };

test("node/module.c declares Node-API version 10", () => {
  assertEqual(addon.moduleNapiVersion(), 10);
});

test("initializing defines only createBinding on the exports, whose binding works, and file connections opened after it wait 5 seconds for a lock, and memory ones not at all", () => {
  const exports: { createBinding?: (rowBuilder: unknown) => unknown } = {};

  assertSame(addon.initializeModule(exports), exports);
  assertEqual(Object.keys(exports), ["createBinding"]);
  const binding = exports.createBinding?.(
    createNativeSqliteRowBuilder(),
  ) as NativeSqlite;
  const file = binding.openFile(join(directory, "busy.db"));
  const memory = binding.openMemory();
  try {
    assertEqual(
      [file, memory].map((database) => database.run("pragma busy_timeout", [])),
      [[{ timeout: 5000 }], [{ timeout: 0 }]],
    );
  } finally {
    file.close();
    memory.close();
  }
});

test("initializing throws whichever call fails, and throws what defining createBinding throws, or its own error for exports it can't define it on", () => {
  const trapped = new Error("The trap threw.");

  assertEqual(
    [
      failEachCall(() => ({})),
      failEachCall(() => Object.freeze({})),
      [
        outcomeOf(
          new Proxy(
            {},
            {
              defineProperty: () => {
                throw trapped;
              },
            },
          ),
        ),
      ],
    ],
    [
      // Registering the timeout, then defining createBinding.
      [failed, failed, "exports"],
      // The same, and a failed check of whether defining it threw, which
      // leaves it nothing to throw, as when Node-API fails that way.
      [failed, failed, { returned: undefined }, failed],
      [{ threw: trapped.message }],
    ],
  );
});
