import { inspect } from "node:util";
import { describe, expect, test } from "vitest";
import type { Brand } from "../src/Brand.js";
import { eqString } from "../src/Eq.js";
import {
  createEqRedacted,
  createRedacted,
  isRedacted,
  revealRedacted,
} from "../src/Redacted.js";
import type { Redacted } from "../src/Redacted.js";

describe("createRedacted hides value", () => {
  test("from toString", () => {
    const secret = createRedacted("my-secret-key");
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    expect(secret.toString()).toBe("<redacted>");
  });

  test("from toJSON", () => {
    const secret = createRedacted("my-secret-key");
    expect(JSON.stringify(secret)).toBe('"<redacted>"');
  });

  test("from JSON.stringify in object", () => {
    const config = {
      apiKey: createRedacted("secret-123"),
      publicValue: "visible",
    };
    expect(JSON.stringify(config)).toBe(
      '{"apiKey":"<redacted>","publicValue":"visible"}',
    );
  });

  test("from Node.js util.inspect", () => {
    const secret = createRedacted("my-secret-key");
    expect(inspect(secret)).toBe("<redacted>");
  });

  test("in string interpolation", () => {
    const secret = createRedacted("my-secret-key");
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    expect(`API key: ${secret}`).toBe("API key: <redacted>");
  });
});

describe("revealRedacted", () => {
  test("retrieves string", () => {
    expect(revealRedacted(createRedacted("string-secret"))).toBe(
      "string-secret",
    );
  });

  test("retrieves number", () => {
    expect(revealRedacted(createRedacted(42))).toBe(42);
  });

  test("retrieves object", () => {
    expect(revealRedacted(createRedacted({ password: "123" }))).toStrictEqual({
      password: "123",
    });
  });

  test("retrieves array", () => {
    expect(revealRedacted(createRedacted(["a", "b", "c"]))).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("retrieves undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    expect(revealRedacted(createRedacted(undefined))).toBe(undefined);
  });
});

describe("isRedacted", () => {
  test("returns true for Redacted values", () => {
    expect(isRedacted(createRedacted("secret"))).toBe(true);
    expect(isRedacted(createRedacted(123))).toBe(true);
    expect(isRedacted(createRedacted({ key: "value" }))).toBe(true);
  });

  test("returns false for non-Redacted values", () => {
    expect(isRedacted("string")).toBe(false);
    expect(isRedacted(123)).toBe(false);
    expect(isRedacted(null)).toBe(false);
    expect(isRedacted(undefined)).toBe(false);
    expect(isRedacted({})).toBe(false);
    expect(isRedacted({ toString: () => "<redacted>" })).toBe(false);
  });
});

test("Redacted is branded - plain objects cannot be assigned", () => {
  const valid = createRedacted("secret");

  // Valid assignment works
  const assigned: Redacted<string> = valid;
  expect(revealRedacted(assigned)).toBe("secret");

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

  expect(useApiKey(redactedKey)).toBe("secret-123");
  expect(useDbPassword(redactedPassword)).toBe("pass-456");

  // @ts-expect-error - Redacted<DbPassword> is not assignable to Redacted<ApiKey>
  useApiKey(redactedPassword);

  // @ts-expect-error - Redacted<string> is not assignable to Redacted<ApiKey>
  useApiKey(createRedacted("plain-string"));
});

describe("createEqRedacted", () => {
  type ApiKey = string & Brand<"ApiKey">;
  const eqRedactedApiKey = createEqRedacted<ApiKey>(eqString);

  test("returns true for equal values", () => {
    const a = createRedacted("x" as ApiKey);
    const b = createRedacted("x" as ApiKey);
    expect(eqRedactedApiKey(a, b)).toBe(true);
  });

  test("returns false for different values", () => {
    const a = createRedacted("x" as ApiKey);
    const b = createRedacted("y" as ApiKey);
    expect(eqRedactedApiKey(a, b)).toBe(false);
  });
});

test("Redacted JSDoc example", () => {
  // Define branded types for your secrets
  type ApiKey = string & Brand<"ApiKey">;
  type DbPassword = string & Brand<"DbPassword">;

  // Wrap them with Redacted for safe passing
  type RedactedApiKey = Redacted<ApiKey>;
  type _RedactedDbPassword = Redacted<DbPassword>;

  // Create a redacted secret
  const apiKey: ApiKey = "secret-123" as ApiKey;
  const redactedKey: RedactedApiKey = createRedacted(apiKey);

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  expect(String(redactedKey)).toBe("<redacted>");
  expect(revealRedacted(redactedKey)).toBe("secret-123");

  // Type safety: RedactedApiKey ≠ RedactedDbPassword
  const fetchUser = (key: RedactedApiKey) => {
    const value: ApiKey = revealRedacted(key);
    return value;
  };

  expect(fetchUser(redactedKey)).toBe("secret-123");

  // @ts-expect-error - RedactedDbPassword is not assignable to RedactedApiKey
  fetchUser(createRedacted("x" as DbPassword));
});

describe("Disposable", () => {
  test("Symbol.dispose removes value from registry", () => {
    const secret = createRedacted("sensitive");
    expect(revealRedacted(secret)).toBe("sensitive");

    secret[Symbol.dispose]();

    expect(() => revealRedacted(secret)).toThrow(
      "Redacted value was not in registry",
    );
  });

  test("works with using syntax", () => {
    let secretRef: Redacted<string> | undefined;

    {
      using secret = createRedacted("sensitive");
      secretRef = secret;
      expect(revealRedacted(secret)).toBe("sensitive");
    }

    // After scope exits, the secret should be wiped
    expect(() => revealRedacted(secretRef)).toThrow(
      "Redacted value was not in registry",
    );
  });

  test("isRedacted still returns true after dispose", () => {
    const secret = createRedacted("sensitive");
    secret[Symbol.dispose]();
    // The object is still a Redacted wrapper, just empty
    expect(isRedacted(secret)).toBe(true);
  });
});
