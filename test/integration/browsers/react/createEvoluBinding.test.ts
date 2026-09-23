import { act, createElement, StrictMode, type FC } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, test } from "vitest";
import { assertEqual } from "../../../../packages/common/src/Assert.ts";
import type { Evolu } from "../../../../packages/common/src/local-first/Evolu.ts";
import {
  createOwnerWebSocketTransport,
  testAppOwner,
  type Owner,
  type ReadonlyOwner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import { createEvoluBinding } from "../../../../packages/react/src/local-first/createEvoluBinding.ts";

beforeAll(() => {
  // Tells React that updates are wrapped in act.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

const { EvoluContext, useOwner } = createEvoluBinding();

/** An Evolu stub that records each owner registration and its release. */
const createEvoluStub = (calls: Array<string>): Evolu =>
  // Only useOwner is used by these components.
  ({
    useOwner: (owner, transports) => {
      const label = `${"writeKey" in owner ? "writable" : "readonly"} ${transports?.map(({ url }) => url.split("?")[0]).join(",")}`;
      calls.push(`use ${label}`);
      return () => {
        calls.push(`unuse ${label}`);
      };
    },
  }) as Pick<Evolu, "useOwner"> as Evolu;

/** Renders components that call `useOwner` under an Evolu stub. */
const setupUseOwner = () => {
  const calls: Array<string> = [];
  const evolu = createEvoluStub(calls);
  const root = createRoot(document.createElement("div"));

  const render = (
    element: ReturnType<typeof createElement>,
    value: Evolu = evolu,
  ): void => {
    act(() => {
      root.render(createElement(EvoluContext, { value }, element));
    });
  };

  return {
    calls,
    render,
    [Symbol.dispose]: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};

// Recreates the owner and transports on every render, as callers usually do.
const Registration: FC<{
  readonly owner: ReadonlyOwner | Owner | null;
  readonly url: string;
}> = ({ owner, url }) => {
  useOwner(owner && { ...owner }, [
    createOwnerWebSocketTransport({ url, ownerId: testAppOwner.id }),
  ]);
  return null;
};

test("registers an equal owner once and releases it on change and unmount", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://a.example",
    }),
  );
  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://a.example",
    }),
  );
  assertEqual(calls, ["use writable wss://a.example"]);

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://b.example",
    }),
  );
  assertEqual(calls.splice(0), [
    "use writable wss://a.example",
    "unuse writable wss://a.example",
    "use writable wss://b.example",
  ]);

  // A readonly owner with the same ID is a different registration.
  const { id, encryptionKey } = testAppOwner;
  render(
    createElement(Registration, {
      owner: { id, encryptionKey },
      url: "wss://b.example",
    }),
  );
  assertEqual(calls.splice(0), [
    "unuse writable wss://b.example",
    "use readonly wss://b.example",
  ]);

  render(createElement("div"));
  assertEqual(calls, ["unuse readonly wss://b.example"]);
});

test("moves the registration to another Evolu instance", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;
  const otherCalls: Array<string> = [];
  const element = createElement(Registration, {
    owner: testAppOwner,
    url: "wss://a.example",
  });

  render(element);
  render(element, createEvoluStub(otherCalls));
  assertEqual(calls, [
    "use writable wss://a.example",
    "unuse writable wss://a.example",
  ]);
  assertEqual(otherCalls, ["use writable wss://a.example"]);
});

test("uses no owner while it is null", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(createElement(Registration, { owner: null, url: "wss://a.example" }));
  assertEqual(calls, []);

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: "wss://a.example",
    }),
  );
  render(createElement(Registration, { owner: null, url: "wss://a.example" }));
  assertEqual(calls, [
    "use writable wss://a.example",
    "unuse writable wss://a.example",
  ]);
});

test("keeps one registration in StrictMode", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(
    createElement(
      StrictMode,
      null,
      createElement(Registration, {
        owner: testAppOwner,
        url: "wss://a.example",
      }),
    ),
  );
  // StrictMode renders twice, and React may also run the effect twice with a
  // cleanup in between. Either way, one registration remains.
  const useCount = calls.filter((call) => call.startsWith("use ")).length;
  assertEqual(useCount - (calls.length - useCount), 1);
});
