import { inspect } from "node:util";
import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertNotUndefined,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";
import type { Brand } from "./Brand.ts";
import { constVoid } from "./Function.ts";
import { installPolyfills } from "./Polyfills.ts";
import { createRedacted, isRedacted, revealRedacted } from "./Redacted.ts";
import type { Redacted } from "./Redacted.ts";

describe("createRedacted hides value", () => {
  it("from toString", () => {
    const secret = createRedacted("my-secret-key");
    assertEqual(secret.toString(), "<redacted>");
  });

  it("from toJSON", () => {
    const secret = createRedacted("my-secret-key");
    assertEqual(JSON.stringify(secret), '"<redacted>"');
  });

  it("from JSON.stringify in object", () => {
    const config = {
      apiKey: createRedacted("secret-123"),
      publicValue: "visible",
    };
    assertEqual(
      JSON.stringify(config),
      '{"apiKey":"<redacted>","publicValue":"visible"}',
    );
  });

  it("from Node.js util.inspect", () => {
    const secret = createRedacted("my-secret-key");
    assertEqual(inspect(secret), "<redacted>");
  });

  it("in string interpolation", () => {
    const secret = createRedacted("my-secret-key");
    assertEqual(`API key: ${secret}`, "API key: <redacted>"); // oxlint-disable-line typescript/restrict-template-expressions -- This test verifies Redacted's implicit string conversion.
  });
});

describe("revealRedacted", () => {
  it("retrieves string", () => {
    assertEqual(
      revealRedacted(createRedacted("string-secret")),
      "string-secret",
    );
  });

  it("retrieves number", () => {
    assertEqual(revealRedacted(createRedacted(42)), 42);
  });

  it("retrieves object", () => {
    assertEqual(revealRedacted(createRedacted({ password: "123" })), {
      password: "123",
    });
  });

  it("retrieves array", () => {
    assertEqual(revealRedacted(createRedacted(["a", "b", "c"])), [
      "a",
      "b",
      "c",
    ]);
  });

  it("retrieves undefined", () => {
    assertEqual(revealRedacted(createRedacted(undefined)), undefined);
  });

  it("throws for a structured clone", () => {
    const clone = structuredClone(createRedacted("sensitive"));

    assertFalse(isRedacted(clone));
    assertEqual(
      assertThrowsInstanceOf(() => revealRedacted(clone), Error).message,
      "Redacted value was not in registry",
    );
  });
});

describe("isRedacted", () => {
  it("returns true for Redacted values", () => {
    assertTrue(isRedacted(createRedacted("secret")));
    assertTrue(isRedacted(createRedacted(123)));
    assertTrue(isRedacted(createRedacted({ key: "value" })));
  });

  it("returns false for non-Redacted values", () => {
    assertFalse(isRedacted("string"));
    assertFalse(isRedacted(123));
    assertFalse(isRedacted(null));
    assertFalse(isRedacted(undefined));
    assertFalse(isRedacted({}));
    assertFalse(isRedacted({ toString: () => "<redacted>" }));
  });
});

test("Redacted is branded", () => {
  const assigned: Redacted<string> = createRedacted("secret");
  assertEqual(revealRedacted(assigned), "secret");

  void ({
    Type: "secret",
    toString: () => "<redacted>",
    toJSON: () => "<redacted>",
    [Symbol.dispose]: constVoid,
    // @ts-expect-error Only createRedacted produces the Redacted brand.
  } satisfies Redacted<string>);
});

test("branded inner type provides type-level distinction", () => {
  type ApiKey = string & Brand<"ApiKey">;
  type DbPassword = string & Brand<"DbPassword">;

  const apiKey = "secret-123" as ApiKey;
  const redactedKey: Redacted<ApiKey> = createRedacted(apiKey);

  const dbPassword = "pass-456" as DbPassword;
  const redactedPassword: Redacted<DbPassword> = createRedacted(dbPassword);

  // Functions requiring specific branded types
  const useApiKey = (k: Redacted<ApiKey>) => revealRedacted(k);
  const useDbPassword = (p: Redacted<DbPassword>) => revealRedacted(p);

  assertEqual(useApiKey(redactedKey), "secret-123");
  assertEqual(useDbPassword(redactedPassword), "pass-456");

  // @ts-expect-error - Redacted<DbPassword> is not assignable to Redacted<ApiKey>
  useApiKey(redactedPassword);

  // @ts-expect-error - Redacted<string> is not assignable to Redacted<ApiKey>
  useApiKey(createRedacted("plain-string"));
});

describe("Disposable", () => {
  it("Symbol.dispose removes value from registry", () => {
    const secret = createRedacted("sensitive");
    assertEqual(revealRedacted(secret), "sensitive");

    secret[Symbol.dispose]();

    assertEqual(
      assertThrowsInstanceOf(() => revealRedacted(secret), Error).message,
      "Redacted value was not in registry",
    );
  });

  it("works with using syntax", () => {
    let secretRef: Redacted<string> | undefined;

    {
      using secret = createRedacted("sensitive");
      secretRef = secret;
      assertEqual(revealRedacted(secret), "sensitive");
    }

    // After the scope exits, the secret can no longer be revealed.
    assertEqual(
      assertThrowsInstanceOf(() => revealRedacted(secretRef), Error).message,
      "Redacted value was not in registry",
    );
  });

  it("disposes through a detached dispose method", () => {
    const secret = createRedacted("sensitive");

    {
      using stack = new DisposableStack();
      stack.defer(secret[Symbol.dispose]);
    }

    assertEqual(
      assertThrowsInstanceOf(() => revealRedacted(secret), Error).message,
      "Redacted value was not in registry",
    );
  });

  it("is disposable when Symbol.dispose is installed after import", () => {
    // Apps call installPolyfills after their imports are evaluated, so a
    // polyfilled Symbol.dispose appears only after this module has loaded.
    const symbolDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "Symbol",
    );
    assertNotUndefined(symbolDescriptor);
    const nativeSymbol = Symbol;
    const symbolWithoutDispose = ((description?: string) =>
      nativeSymbol(description)) as unknown as SymbolConstructor;
    for (const key of Reflect.ownKeys(nativeSymbol)) {
      if (key === "dispose" || key === "asyncDispose") continue;
      if (Object.hasOwn(symbolWithoutDispose, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(nativeSymbol, key);
      assertNotUndefined(descriptor);
      Object.defineProperty(symbolWithoutDispose, key, descriptor);
    }
    Object.defineProperty(globalThis, "Symbol", {
      ...symbolDescriptor,
      value: symbolWithoutDispose,
    });

    try {
      installPolyfills();

      const secret = createRedacted("sensitive");
      secret[Symbol.dispose]();

      assertEqual(
        assertThrowsInstanceOf(() => revealRedacted(secret), Error).message,
        "Redacted value was not in registry",
      );
    } finally {
      Object.defineProperty(globalThis, "Symbol", symbolDescriptor);
    }
  });

  it("makes isRedacted return false", () => {
    const secret = createRedacted("sensitive");
    assertTrue(isRedacted(secret));

    secret[Symbol.dispose]();

    // A disposed wrapper cannot be revealed, so it is not Redacted.
    assertFalse(isRedacted(secret));
  });
});
