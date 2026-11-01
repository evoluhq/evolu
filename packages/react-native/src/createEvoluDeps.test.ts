import {
  assertEqual,
  assertErr,
  assertOk,
  assertSame,
  createConsole,
  EncryptionKey,
  Entropy24,
  Name,
  testCreateRun,
  XChaCha20Poly1305Ciphertext,
  type ConsoleDep,
  type CreateSqliteDriverDep,
  type ReloadAppDep,
  type XChaCha20Poly1305Dep,
} from "@evolu/common";
import type {
  DeleteDatabaseFilesDep,
  WaitForDatabaseReleaseDep,
} from "@evolu/common/local-first";
import { mock, test } from "node:test";

/** What the fakes were asked, in order. */
const calls: Array<string> = [];

/** The arguments of the binding's XChaCha20-Poly1305 calls, in order. */
const xChaChaArguments: Array<ReadonlyArray<Uint8Array>> = [];
const plaintext = new Uint8Array([1, 2, 3]);
const ciphertext = XChaCha20Poly1305Ciphertext.orThrow(new Uint8Array(19));
const forgedCiphertext = XChaCha20Poly1305Ciphertext.orThrow(
  new Uint8Array(19).fill(1),
);
const forgedTagError = new Error("forged tag");

// The specs import React Native, which Node.js can't load.
mock.module(new URL("./specs/NativeEvoluSqlite.ts", import.meta.url).href, {
  exports: {
    default: {
      createBinding: () => {
        calls.push("createBinding");
        return {
          abiVersion: 2,
          openEncryptedFile: (path: string) => {
            calls.push(`openEncryptedFile ${path}`);
            return {
              close: () => {
                calls.push("close");
              },
            };
          },
          isFileOpen: (path: string) => {
            calls.push(`isFileOpen ${path}`);
            return false;
          },
          deleteFile: (path: string) => {
            calls.push(`deleteFile ${path}`);
          },
          encryptXChaCha20Poly1305: (...args: ReadonlyArray<Uint8Array>) => {
            calls.push("encryptXChaCha20Poly1305");
            xChaChaArguments.push(args);
            return ciphertext;
          },
          decryptXChaCha20Poly1305: (...args: ReadonlyArray<Uint8Array>) => {
            calls.push("decryptXChaCha20Poly1305");
            xChaChaArguments.push(args);
            if (args[2] === forgedCiphertext) throw forgedTagError;
            return plaintext;
          },
        };
      },
    },
  },
});
mock.module(new URL("./specs/NativeEvoluApp.ts", import.meta.url).href, {
  exports: {
    default: {
      getDatabaseDirectory: () => {
        calls.push("getDatabaseDirectory");
        return "/data/SQLite";
      },
      reloadApp: () => {
        calls.push("reloadApp");
      },
    },
  },
});

type SharedDeps = ConsoleDep &
  CreateSqliteDriverDep &
  DeleteDatabaseFilesDep &
  ReloadAppDep &
  WaitForDatabaseReleaseDep &
  XChaCha20Poly1305Dep;

/** What createEvoluDeps passed to the shared wiring, which Node.js runs too. */
const sharedDeps: Array<SharedDeps> = [];
const evoluDeps = {};
mock.module(new URL("./shared.ts", import.meta.url).href, {
  exports: {
    createEvoluDeps: (deps: SharedDeps) => {
      sharedDeps.push(deps);
      return evoluDeps;
    },
  },
});

const { createEvoluDeps } = await import("./createEvoluDeps.ts");
const callsAtImport = [...calls];

const testName = Name.orThrow("Test");

test("wires the native driver, waitForDatabaseRelease, deleteDatabaseFiles, EvoluApp's reloadApp and the binding's XChaCha20-Poly1305 into the shared wiring, in EvoluApp's directory", async () => {
  const console = createConsole();

  assertSame(createEvoluDeps({ console }), evoluDeps);
  assertEqual(callsAtImport, []);
  assertEqual(calls, ["createBinding", "getDatabaseDirectory"]);
  const [deps] = sharedDeps;
  assertSame(deps.console, console);

  const encryptionKey = EncryptionKey.orThrow(new Uint8Array(32));
  await using run = testCreateRun();
  {
    using _driver = await run.ok(
      deps.createSqliteDriver(testName, { mode: "encrypted", encryptionKey }),
    );
  }
  assertOk(await run(deps.waitForDatabaseRelease(testName)));
  assertOk(await run(deps.deleteDatabaseFiles(testName)));
  deps.reloadApp();

  // The binding takes the key first and the nonce second.
  const nonce = Entropy24.orThrow(new Uint8Array(24));
  assertSame(
    deps.xChaCha20Poly1305.encrypt(plaintext, nonce, encryptionKey),
    ciphertext,
  );
  const decrypted = deps.xChaCha20Poly1305.decrypt(
    ciphertext,
    nonce,
    encryptionKey,
  );
  assertOk(decrypted);
  assertSame(decrypted.value, plaintext);
  // The binding throws only when the tag doesn't authenticate.
  const forged = deps.xChaCha20Poly1305.decrypt(
    forgedCiphertext,
    nonce,
    encryptionKey,
  );
  assertErr(forged);
  assertEqual(forged.error, {
    type: "DecryptWithXChaCha20Poly1305Error",
    error: forgedTagError,
  });

  assertEqual(calls.slice(2), [
    "openEncryptedFile /data/SQLite/evolu1-Test.db",
    "close",
    "isFileOpen /data/SQLite/evolu1-Test.db",
    "deleteFile /data/SQLite/evolu1-Test.db",
    "reloadApp",
    "encryptXChaCha20Poly1305",
    "decryptXChaCha20Poly1305",
    "decryptXChaCha20Poly1305",
  ]);
  for (const [args, expected] of [
    [xChaChaArguments[0], [encryptionKey, nonce, plaintext]],
    [xChaChaArguments[1], [encryptionKey, nonce, ciphertext]],
    [xChaChaArguments[2], [encryptionKey, nonce, forgedCiphertext]],
  ] as const) {
    assertSame(args.length, 3);
    args.forEach((arg, index) => {
      assertSame(arg, expected[index]);
    });
  }
});
