import { eqData } from "../Eq.ts";
import { test } from "node:test";
import { assertEqual, assertFalse, assertNotUndefined } from "../Assert.ts";

import {
  createAppOwner,
  createOwnerSecret,
  deriveShardOwner,
  mnemonicToOwnerSecret,
  ownerIdBytesToOwnerId,
  ownerIdToOwnerIdBytes,
  ownerSecretToMnemonic,
  testAppOwner,
  testOwnerSecret,
} from "./Owner.ts";
import { testCreateDeps } from "../Task.ts";

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

  assertFalse(globalThis.Object.is(contacts.id, photos.id));
  assertFalse(eqData(contacts.encryptionKey, photos.encryptionKey));
  assertFalse(eqData(contacts.writeKey, photos.writeKey));
});

test("deriveShardOwner with nested paths", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const project1 = deriveShardOwner(appOwner, ["projects", "project-1"]);
  const project2 = deriveShardOwner(appOwner, ["projects", "project-2"]);

  assertFalse(globalThis.Object.is(project1.id, project2.id));
  assertEqual(project1.type, "ShardOwner");
  assertEqual(project2.type, "ShardOwner");
});

test("different app owners produce different shard owners", () => {
  const appOwner1 = createAppOwner(testOwnerSecret);
  const appOwner2 = createAppOwner(testOwnerSecret2);

  const shard1 = deriveShardOwner(appOwner1, ["contacts"]);
  const shard2 = deriveShardOwner(appOwner2, ["contacts"]);

  assertFalse(globalThis.Object.is(shard1.id, shard2.id));
});
