import { expect, test } from "vitest";
import {
  binaryOwnerIdToOwnerId,
  createAppOwner,
  createOwnerSecret,
  deriveShardOwner,
  mnemonicToOwnerSecret,
  ownerIdToBinaryOwnerId,
  ownerSecretToMnemonic,
} from "../../src/index.js";
import {
  testCreateRandomBytesDep,
  testOwner,
  testOwnerSecret,
  testOwnerSecret2,
} from "../_deps.js";

test("ownerIdToBinaryOwnerId/binaryOwnerIdToOwnerId", () => {
  const id = testOwner.id;
  expect(binaryOwnerIdToOwnerId(ownerIdToBinaryOwnerId(id))).toStrictEqual(id);
});

test("ownerSecretToMnemonic and mnemonicToOwnerSecret are inverses", () => {
  const secret = createOwnerSecret(testCreateRandomBytesDep);
  const mnemonic = ownerSecretToMnemonic(secret);
  const backToSecret = mnemonicToOwnerSecret(mnemonic);

  expect(backToSecret).toEqual(secret);
});

test("createAppOwner is deterministic", () => {
  const owner1 = createAppOwner(testOwnerSecret);
  const owner2 = createAppOwner(testOwnerSecret);

  expect(owner1).toEqual(owner2);
  expect(owner1.type).toBe("AppOwner");
  expect(owner1.mnemonic).toBeDefined();
});

test("deriveShardOwner is deterministic", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const shard1 = deriveShardOwner(appOwner, ["contacts"]);
  const shard2 = deriveShardOwner(appOwner, ["contacts"]);

  expect(shard1).toEqual(shard2);
  expect(shard1.type).toBe("ShardOwner");
});

test("deriveShardOwner with different paths produces different owners", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const contacts = deriveShardOwner(appOwner, ["contacts"]);
  const photos = deriveShardOwner(appOwner, ["photos"]);

  expect(contacts.id).not.toBe(photos.id);
  expect(contacts.encryptionKey).not.toEqual(photos.encryptionKey);
  expect(contacts.writeKey).not.toEqual(photos.writeKey);
});

test("deriveShardOwner with nested paths", () => {
  const appOwner = createAppOwner(testOwnerSecret);

  const project1 = deriveShardOwner(appOwner, ["projects", "project-1"]);
  const project2 = deriveShardOwner(appOwner, ["projects", "project-2"]);

  expect(project1.id).not.toBe(project2.id);
  expect(project1.type).toBe("ShardOwner");
  expect(project2.type).toBe("ShardOwner");
});

test("different app owners produce different shard owners", () => {
  const appOwner1 = createAppOwner(testOwnerSecret);
  const appOwner2 = createAppOwner(testOwnerSecret2);

  const shard1 = deriveShardOwner(appOwner1, ["contacts"]);
  const shard2 = deriveShardOwner(appOwner2, ["contacts"]);

  expect(shard1.id).not.toBe(shard2.id);
});
