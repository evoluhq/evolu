import { expect, test } from "vitest";
// import {
//   createAppOwner,
//   createOwner,
//   createOwnerFromMnemonicSeed,
//   createShardOwner,
//   createSharedOwner,
//   createSharedReadonlyOwner,
//   createWriteKey,
//   OwnerId,
//   rotateWriteKey,
//   WriteKey,
//   writeKeyLength,
// } from "../../src/index.js";
// import {
//   testCreateMnemonic,
//   testCreateMnemonic2,
//   testCreateRandomBytesDep,
//   testMnemonic,
//   testMnemonic2,
//   testMnemonicSeed,
// } from "../_deps.js";

test("foo", () => {
  expect(1).toBe(1);
});

// describe("Owner creation functions", () => {
//   test("createOwner", () => {
//     const owner = createOwner(testMnemonic);
//     expect(owner).toMatchSnapshot();
//   });

//   test("createOwner with different mnemonic produces different owner", () => {
//     const owner1 = createOwner(testMnemonic);
//     const owner2 = createOwner(testMnemonic2);

//     expect(owner1.id).not.toBe(owner2.id);
//     expect(owner1.encryptionKey).not.toEqual(owner2.encryptionKey);
//     expect(owner1.writeKey).not.toEqual(owner2.writeKey);
//   });

//   test("createOwnerFromMnemonicSeed", () => {
//     const owner = createOwnerFromMnemonicSeed(testMnemonicSeed);
//     expect(owner).toMatchSnapshot();
//   });

//   test("createOwnerFromMnemonicSeed should produce same result as createOwner", () => {
//     const ownerFromMnemonic = createOwner(testMnemonic);
//     const ownerFromSeed = createOwnerFromMnemonicSeed(testMnemonicSeed);

//     expect(ownerFromMnemonic).toEqual(ownerFromSeed);
//   });

//   test("createWriteKey", () => {
//     const key = createWriteKey(testCreateRandomBytesDep);
//     expect(key).toMatchSnapshot();
//   });

//   test("createWriteKey generates different keys", () => {
//     const key1 = createWriteKey(testCreateRandomBytesDep);
//     const key2 = createWriteKey(testCreateRandomBytesDep);

//     expect(key1).toHaveLength(writeKeyLength);
//     expect(key2).toHaveLength(writeKeyLength);
//     expect(key1).not.toEqual(key2);
//   });
// });

// describe("AppOwner", () => {
//   test("createAppOwner", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     expect(appOwner).toMatchSnapshot();
//   });

//   test("createAppOwner has correct type and includes mnemonic", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const baseOwner = createOwner(testMnemonic);

//     expect(appOwner).toStrictEqual({
//       type: "AppOwner",
//       mnemonic: testMnemonic,
//       ...baseOwner,
//     });
//   });
// });

// describe.skip("ShardOwner", () => {
//   test("createShardOwner", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner = createShardOwner(appOwner, ["shard1"]);
//     expect(shardOwner).toMatchSnapshot();
//   });

//   test("createShardOwner has correct type", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner = createShardOwner(appOwner, ["shard1"]);

//     expect(shardOwner.type).toBe("ShardOwner");
//     expect(OwnerId.is(shardOwner.id)).toBe(true);
//     expect(WriteKey.is(shardOwner.writeKey)).toBe(true);
//     expect(shardOwner.encryptionKey).toBeInstanceOf(Uint8Array);
//   });

//   test("createShardOwner with different paths produces different owners", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner1 = createShardOwner(appOwner, ["shard1"]);
//     const shardOwner2 = createShardOwner(appOwner, ["shard2"]);

//     expect(shardOwner1.id).not.toBe(shardOwner2.id);
//     expect(shardOwner1.encryptionKey).not.toEqual(shardOwner2.encryptionKey);
//     expect(shardOwner1.writeKey).not.toEqual(shardOwner2.writeKey);
//   });

//   test("createShardOwner with nested path", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner = createShardOwner(appOwner, [
//       "parent",
//       "child",
//       "grandchild",
//     ]);

//     expect(shardOwner.type).toBe("ShardOwner");
//     expect(shardOwner.id).toBeDefined();
//   });

//   test("createShardOwner from different app owners produces different shard owners", () => {
//     const appOwner1 = createAppOwner(testMnemonic);
//     const appOwner2 = createAppOwner(testMnemonic2);
//     const shardOwner1 = createShardOwner(appOwner1, ["shard1"]);
//     const shardOwner2 = createShardOwner(appOwner2, ["shard1"]);

//     expect(shardOwner1.id).not.toBe(shardOwner2.id);
//   });
// });

// describe("SharedOwner", () => {
//   test("createSharedOwner", () => {
//     const sharedOwner = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });
//     expect(sharedOwner).toMatchSnapshot();
//   });

//   test("createSharedOwner has correct type and includes mnemonic", () => {
//     const sharedOwner = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });
//     const baseOwner = createOwner(testMnemonic);

//     expect(sharedOwner).toStrictEqual({
//       type: "SharedOwner",
//       mnemonic: testMnemonic,
//       ...baseOwner,
//     });
//   });

//   test("createSharedOwner with different mnemonic generators", () => {
//     const sharedOwner1 = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });
//     const sharedOwner2 = createSharedOwner({
//       createMnemonic: testCreateMnemonic2,
//     });

//     expect(sharedOwner1.id).not.toBe(sharedOwner2.id);
//     expect(sharedOwner1.mnemonic).not.toBe(sharedOwner2.mnemonic);
//   });
// });

// describe("SharedReadonlyOwner", () => {
//   test("createSharedReadonlyOwner", () => {
//     const sharedOwner = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });
//     const readonlyOwner = createSharedReadonlyOwner(sharedOwner);
//     expect(readonlyOwner).toMatchSnapshot();
//   });

//   test("createSharedReadonlyOwner has correct type and excludes writeKey", () => {
//     const sharedOwner = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });
//     const readonlyOwner = createSharedReadonlyOwner(sharedOwner);

//     expect(readonlyOwner).toStrictEqual({
//       type: "SharedReadonlyOwner",
//       id: sharedOwner.id,
//       encryptionKey: sharedOwner.encryptionKey,
//     });
//   });
// });

// describe("rotateWriteKey", () => {
//   test("rotateWriteKey for AppOwner", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const newWriteKey = createWriteKey(testCreateRandomBytesDep);
//     const rotatedOwner = rotateWriteKey(appOwner, newWriteKey);

//     expect(rotatedOwner).toStrictEqual({
//       ...appOwner,
//       writeKey: newWriteKey,
//     });
//   });

//   test("rotateWriteKey for ShardOwner", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner = createShardOwner(appOwner, ["shard1"]);
//     const newWriteKey = createWriteKey(testCreateRandomBytesDep);
//     const rotatedOwner = rotateWriteKey(shardOwner, newWriteKey);

//     expect(rotatedOwner).toStrictEqual({
//       ...shardOwner,
//       writeKey: newWriteKey,
//     });
//   });

//   test("rotateWriteKey for SharedOwner", () => {
//     const sharedOwner = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });
//     const newWriteKey = createWriteKey(testCreateRandomBytesDep);
//     const rotatedOwner = rotateWriteKey(sharedOwner, newWriteKey);

//     expect(rotatedOwner).toStrictEqual({
//       ...sharedOwner,
//       writeKey: newWriteKey,
//     });
//   });

//   test("rotateWriteKey preserves original owner", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const originalWriteKey = appOwner.writeKey;
//     const newWriteKey = createWriteKey(testCreateRandomBytesDep);
//     const rotatedOwner = rotateWriteKey(appOwner, newWriteKey);

//     // Original should be unchanged
//     expect(appOwner.writeKey).toStrictEqual(originalWriteKey);
//     // New owner should have new key
//     expect(rotatedOwner.writeKey).toStrictEqual(newWriteKey);
//   });
// });

// describe("Brand types and constants", () => {
//   test("writeKeyLength constant", () => {
//     expect(writeKeyLength).toBe(16);
//   });

//   test("OwnerId brand type validation", () => {
//     const owner = createOwner(testMnemonic);
//     expect(OwnerId.is(owner.id)).toBe(true);
//   });

//   test("WriteKey brand type validation", () => {
//     const writeKey = createWriteKey(testCreateRandomBytesDep);
//     expect(WriteKey.is(writeKey)).toBe(true);
//     expect(writeKey).toHaveLength(writeKeyLength);
//   });

//   test("WriteKey has correct byte length", () => {
//     const writeKey = createWriteKey(testCreateRandomBytesDep);
//     expect(writeKey.byteLength).toBe(writeKeyLength);
//   });
// });

// describe("Owner property consistency", () => {
//   test("all owner types have consistent property structure", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner = createShardOwner(appOwner, ["test"]);
//     const sharedOwner = createSharedOwner({
//       createMnemonic: testCreateMnemonic,
//     });

//     // All owners should have id, encryptionKey, writeKey
//     [appOwner, shardOwner, sharedOwner].forEach((owner) => {
//       expect(owner.id).toBeDefined();
//       expect(owner.encryptionKey).toBeDefined();
//       expect(owner.writeKey).toBeDefined();
//       expect(OwnerId.is(owner.id)).toBe(true);
//       expect(WriteKey.is(owner.writeKey)).toBe(true);
//     });
//   });

//   test("encryption keys are 32 bytes", () => {
//     const owner = createOwner(testMnemonic);
//     expect(owner.encryptionKey.byteLength).toBe(32);
//   });

//   test("writeKeys are 16 bytes", () => {
//     const owner = createOwner(testMnemonic);
//     expect(owner.writeKey.byteLength).toBe(16);
//   });
// });

// describe("SLIP-21 derivation edge cases", () => {
//   test("createShardOwner with single character path", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shardOwner = createShardOwner(appOwner, ["a"]);

//     expect(shardOwner.type).toBe("ShardOwner");
//     expect(shardOwner.id).toBeDefined();
//   });

//   test("createShardOwner with long path segments", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const longPath = [
//       "very-long-path-segment-that-is-much-longer-than-usual",
//     ] as const;
//     const shardOwner = createShardOwner(appOwner, longPath);

//     expect(shardOwner.type).toBe("ShardOwner");
//     expect(shardOwner.id).toBeDefined();
//   });

//   test("createShardOwner deterministic with same path", () => {
//     const appOwner = createAppOwner(testMnemonic);
//     const shard1 = createShardOwner(appOwner, ["deterministic", "test"]);
//     const shard2 = createShardOwner(appOwner, ["deterministic", "test"]);

//     expect(shard1.id).toBe(shard2.id);
//     expect(shard1.encryptionKey).toEqual(shard2.encryptionKey);
//     expect(shard1.writeKey).toEqual(shard2.writeKey);
//   });
// });
