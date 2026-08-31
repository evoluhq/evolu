import { inspect } from "node:util";
import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertThrowsInstanceOf,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import type { Brand } from "../../../../packages/common/src/Brand.ts";
import { eqString } from "../../../../packages/common/src/Eq.ts";
import {
  createEqRedacted,
  createRedacted,
  isRedacted,
  revealRedacted,
} from "../../../../packages/common/src/Redacted.ts";
import type { Redacted } from "../../../../packages/common/src/Redacted.ts";

describe("createRedacted hides value", () => {
  it("from toString", () => {
    const secret = createRedacted("my-secret-key");
    // oxlint-disable-next-line typescript/no-base-to-string
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
    assertEqual(`API key: ${secret}`, "API key: <redacted>"); // oxlint-disable-line typescript/no-base-to-string, typescript/restrict-template-expressions -- This test verifies Redacted's implicit string conversion.
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

test("Redacted is branded - plain objects cannot be assigned", () => {
  const valid = createRedacted("secret");

  // Valid assignment works
  const assigned: Redacted<string> = valid;
  assertEqual(revealRedacted(assigned), "secret");

  // Plain object cannot be assigned to Redacted (brand prevents it)
  // @ts-expect-error - {} is not assignable to Redacted<string>
  const _fake: Redacted<string> = {};
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

describe("createEqRedacted", () => {
  type ApiKey = string & Brand<"ApiKey">;
  const eqRedactedApiKey = createEqRedacted<ApiKey>(eqString);

  it("returns true for equal values", () => {
    const a = createRedacted("x" as ApiKey);
    const b = createRedacted("x" as ApiKey);
    assertTrue(eqRedactedApiKey(a, b));
  });

  it("returns false for different values", () => {
    const a = createRedacted("x" as ApiKey);
    const b = createRedacted("y" as ApiKey);
    assertFalse(eqRedactedApiKey(a, b));
  });
});

test("Redacted JSDoc example", () => {
  // Define branded types for your secrets
  type ApiKey = string & Brand<"ApiKey">;
  type DbPassword = string & Brand<"DbPassword">;

  // Wrap it with Redacted for safe passing
  type RedactedApiKey = Redacted<ApiKey>;

  // Create a redacted secret
  const apiKey: ApiKey = "secret-123" as ApiKey;
  const redactedKey: RedactedApiKey = createRedacted(apiKey);

  // oxlint-disable-next-line typescript/no-base-to-string
  assertEqual(String(redactedKey), "<redacted>");
  assertEqual(revealRedacted(redactedKey), "secret-123");

  // Type safety: RedactedApiKey ≠ RedactedDbPassword
  const fetchUser = (key: RedactedApiKey) => {
    const value: ApiKey = revealRedacted(key);
    return value;
  };

  assertEqual(fetchUser(redactedKey), "secret-123");

  // @ts-expect-error - RedactedDbPassword is not assignable to RedactedApiKey
  fetchUser(createRedacted("x" as DbPassword));
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

    // After scope exits, the secret should be wiped
    assertEqual(
      assertThrowsInstanceOf(() => revealRedacted(secretRef), Error).message,
      "Redacted value was not in registry",
    );
  });

  it("isRedacted still returns true after dispose", () => {
    const secret = createRedacted("sensitive");
    secret[Symbol.dispose]();
    // The object is still a Redacted wrapper, just empty
    assertTrue(isRedacted(secret));
  });
});
