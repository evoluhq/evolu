import { bytesToHex } from "@noble/hashes/utils.js";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { eqData } from "../Eq.ts";
import { test } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertNotUndefined,
  assertTrue,
} from "../Assert.ts";

import {
  createAppOwner,
  createOwnerSecret,
  deriveShardOwner,
  mnemonicToOwnerSecret,
  OwnerSecret,
  ownerIdBytesToOwnerId,
  ownerIdToOwnerIdBytes,
  ownerSecretToMnemonic,
  testAppOwner,
  testOwnerSecret,
} from "./Owner.ts";
import { testCreateDeps } from "../Task.ts";
import { Mnemonic } from "../Type.ts";

const testOwnerSecret2 = createOwnerSecret(testCreateDeps({ seed: "owner-2" }));

test("ownerIdToOwnerIdBytes/ownerIdBytesToOwnerId", () => {
  const id = testAppOwner.id;
  assertEqual(ownerIdBytesToOwnerId(ownerIdToOwnerIdBytes(id)), id);
});

test("ownerSecretToMnemonic and mnemonicToOwnerSecret are inverses", () => {
  const deps = testCreateDeps();
  const secret = createOwnerSecret(deps);
  const mnemonic = ownerSecretToMnemonic(secret);
  const backToSecret = mnemonicToOwnerSecret(mnemonic);

  assertEqual(backToSecret, secret);
});

test("mnemonicToOwnerSecret converts every BIP-39 mnemonic length", () => {
  for (const [words, bytes] of [
    [12, 16],
    [15, 20],
    [18, 24],
    [21, 28],
    [24, 32],
  ] as const) {
    const entropy = new Uint8Array(bytes).fill(words);
    const mnemonic = Mnemonic.orThrow(
      bip39.entropyToMnemonic(entropy, wordlist),
    );
    const secret = mnemonicToOwnerSecret(mnemonic);

    assertEqual(mnemonic.split(" ").length, words);
    assertTrue(OwnerSecret.is(secret));
    assertEqual(secret, entropy);
    assertEqual(ownerSecretToMnemonic(secret), mnemonic);
  }
});

test("OwnerSecret rejects lengths that no mnemonic holds", () => {
  assertFalse(OwnerSecret.is(new Uint8Array(17)));
  assertFalse(OwnerSecret.is(new Uint8Array(64)));
});

test("createAppOwner derives fixed keys from a 12-word mnemonic", () => {
  const owner = createAppOwner(
    mnemonicToOwnerSecret(
      Mnemonic.orThrow("all all all all all all all all all all all all"),
    ),
  );

  assertEqual(owner.id, "njGMKFwCtldekpIYmB-VKA");
  assertEqual(
    bytesToHex(owner.encryptionKey),
    "d9cae8d1e141e9f4824ba9b56b9b991d242c1a37f48a146053c3d69f432c5599",
  );
  assertEqual(bytesToHex(owner.writeKey), "8d77d62517c4d525223647a189261ab2");
});

test("createAppOwner is deterministic", () => {
  const owner1 = createAppOwner(testOwnerSecret);
  const owner2 = createAppOwner(testOwnerSecret);

  assertEqual(owner1, owner2);
  assertEqual(owner1.type, "AppOwner");
  assertNotUndefined(owner1.mnemonic);
});

test("deriveShardOwner is deterministic", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const shard1 = deriveShardOwner(appOwner, ["contacts"]);
  const shard2 = deriveShardOwner(appOwner, ["contacts"]);

  assertEqual(shard1, shard2);
  assertEqual(shard1.type, "ShardOwner");
});

test("deriveShardOwner with different paths produces different owners", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const contacts = deriveShardOwner(appOwner, ["contacts"]);
  const photos = deriveShardOwner(appOwner, ["photos"]);

  assertFalse(Object.is(contacts.id, photos.id));
  assertFalse(eqData(contacts.encryptionKey, photos.encryptionKey));
  assertFalse(eqData(contacts.writeKey, photos.writeKey));
});

test("deriveShardOwner with nested paths", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const project1 = deriveShardOwner(appOwner, ["projects", "project-1"]);
  const project2 = deriveShardOwner(appOwner, ["projects", "project-2"]);

  assertFalse(Object.is(project1.id, project2.id));
  assertEqual(project1.type, "ShardOwner");
  assertEqual(project2.type, "ShardOwner");
});

test("different app owners produce different shard owners", () => {
  const appOwner1 = createAppOwner(testOwnerSecret);
  const appOwner2 = createAppOwner(testOwnerSecret2);

  const shard1 = deriveShardOwner(appOwner1, ["contacts"]);
  const shard2 = deriveShardOwner(appOwner2, ["contacts"]);

  assertFalse(Object.is(shard1.id, shard2.id));
});
