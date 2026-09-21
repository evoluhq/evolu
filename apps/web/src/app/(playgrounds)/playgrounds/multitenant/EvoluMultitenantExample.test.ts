import {
  AppName,
  assertEqual,
  assertLength,
  assertNotUndefined,
  assertSame,
  assertThrowsInstanceOf,
  constVoid,
  createEvolu,
  id,
  ok,
  testAppOwner,
  testCreateBroadcastChannel,
  testCreateLockManager,
  testCreateMessageChannel,
  testCreateRun,
  testCreateSharedWorker,
  testCreateWorker,
  waitForAbort,
  type Evolu,
  type EvoluConfig,
  type EvoluPlatformDeps,
  type Run,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { setImmediate } from "node:timers/promises";
import { compileFunction } from "node:vm";
import * as ts from "typescript";

installPolyfills();

const AppSchema = { todo: { id: id("Todo") } };
type AppEvolu = Evolu<typeof AppSchema>;

// Execute the component's actual effect without loading its module-level
// browser bootstrap. Assertions cover its lifecycle, not its source spelling.
const source = ts.createSourceFile(
  "EvoluMultitenantExample.tsx",
  readFileSync(
    new URL("./EvoluMultitenantExample.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect: ts.Expression | undefined;
const findEffect = (node: ts.Node): void => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "useEffect"
  ) {
    effect = node.arguments[0];
  }
  ts.forEachChild(node, findEffect);
};
for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(source) === "AppEvoluContext")
      findEffect(declaration);
  }
}
assertNotUndefined(effect);
const effectCode = ts.transpileModule(`return (${effect.getText(source)})();`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;

const setupEffect = async ({ waitForDisposal = false } = {}) => {
  await using disposer = new AsyncDisposableStack();
  const sharedWorker = disposer.use(testCreateSharedWorker());
  const instances = disposer.use(new AsyncDisposableStack());
  const run = disposer.use(
    testCreateRun({
      createDbWorker: testCreateWorker,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: testCreateMessageChannel,
      lockManager: testCreateLockManager(),
      reloadApp: constVoid,
      sharedWorker,
    }),
  );
  const created = Promise.withResolvers<AppEvolu>();
  const continueCreation = Promise.withResolvers<void>();
  const disposalStarted = Promise.withResolvers<void>();
  const continueDisposal = Promise.withResolvers<void>();
  if (!waitForDisposal) continueDisposal.resolve();
  const published: Array<AppEvolu> = [];
  let disposeCount = 0;

  const create =
    (schema: typeof AppSchema, config: EvoluConfig) =>
    async (run: Run<EvoluPlatformDeps>) => {
      const instance = await run.ok(
        createEvolu(schema, { ...config, transports: [] }),
      );
      // Retain a test-only cleanup fallback so the failing regression cannot
      // leak the instance whose ownership the effect lost.
      instances.use(instance);
      const dispose = instance[Symbol.asyncDispose];
      instance[Symbol.asyncDispose] = async () => {
        disposeCount++;
        disposalStarted.resolve();
        await continueDisposal.promise;
        await dispose();
      };
      created.resolve(instance);
      // Model successful acquisition completing after cleanup requests abort.
      await continueCreation.promise;
      return ok(instance);
    };

  const evolu = { AppName, createEvolu: create, ok, waitForAbort };
  const startEffect = compileFunction(effectCode, [
    "run",
    "Evolu",
    "AppSchema",
    "appOwner",
    "setAppEvolu",
  ]) as (
    run: Run<EvoluPlatformDeps>,
    api: typeof evolu,
    schema: typeof AppSchema,
    owner: typeof testAppOwner,
    publish: (instance: AppEvolu) => void,
  ) => () => void;
  const cleanup = startEffect(
    run,
    evolu,
    AppSchema,
    testAppOwner,
    (instance) => {
      published.push(instance);
    },
  );
  disposer.defer(() => {
    cleanup();
    continueCreation.resolve();
    continueDisposal.resolve();
  });
  const disposables = disposer.move();

  return {
    run,
    created: created.promise,
    continueCreation: continueCreation.resolve,
    cleanup,
    published,
    disposalStarted: disposalStarted.promise,
    continueDisposal: continueDisposal.resolve,
    getDisposeCount: () => disposeCount,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

describe("AppEvoluContext effect", () => {
  it("disposes a late instance without publishing it or panicking the root", async () => {
    await using setup = await setupEffect();
    const instance = await setup.created;

    setup.cleanup();
    setup.continueCreation();
    await setImmediate();

    assertLength(setup.run.snapshot().children, 0);
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
    assertSame(setup.run.getState().type, "Running");
    assertLength(setup.published, 0);
    assertEqual(setup.getDisposeCount(), 1);
    assertThrowsInstanceOf(() => instance.loadQueries([]), Error);
  });

  it("keeps the published instance alive until cleanup", async () => {
    await using setup = await setupEffect();
    const instance = await setup.created;
    setup.continueCreation();
    await setImmediate();

    assertLength(setup.published, 1);
    assertSame(setup.published[0], instance);
    assertEqual(instance.loadQueries([]), []);
    assertEqual(setup.getDisposeCount(), 0);

    setup.cleanup();
    await setImmediate();

    assertLength(setup.run.snapshot().children, 0);
    assertEqual(setup.getDisposeCount(), 1);
    assertThrowsInstanceOf(() => instance.loadQueries([]), Error);
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
    assertSame(setup.run.getState().type, "Running");
  });

  it("waits for asynchronous instance disposal before finishing the effect", async () => {
    await using setup = await setupEffect({ waitForDisposal: true });
    await setup.created;
    setup.continueCreation();
    await setImmediate();
    assertLength(setup.published, 1);

    setup.cleanup();
    await setup.disposalStarted;
    assertLength(setup.run.snapshot().children, 1);

    setup.continueDisposal();
    await setImmediate();
    assertLength(setup.run.snapshot().children, 0);
    assertEqual(setup.getDisposeCount(), 1);
    assertEqual(setup.run.deps.reportDefect.getDefects(), []);
  });
});
