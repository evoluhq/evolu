import { bytesToHex } from "@noble/hashes/utils.js";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { eqData } from "../Eq.ts";
import { test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertNotUndefined,
  assertOk,
  assertTrue,
} from "../Assert.ts";

import {
  createAppOwner,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  deriveShardOwner,
  mnemonicToOwnerSecret,
  OwnerSecret,
  ownerIdBytesToOwnerId,
  ownerIdToOwnerIdBytes,
  ownerSecretToMnemonic,
  parseOwnerIdFromOwnerWebSocketTransportUrl,
  RelayUrl,
  RelayUrlFromString,
  testAppOwner,
  testOwnerSecret,
} from "./Owner.ts";
import { testCreateDeps } from "../Task.ts";
import { Mnemonic } from "../Type.ts";
import { WebSocketUrl } from "../WebSocket.ts";

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

test("RelayUrl accepts a canonical WebSocketUrl without a query", () => {
  for (const url of [
    "wss://free.evoluhq.com/",
    "ws://localhost:4000/",
    // A path can carry a credential, even with "=".
    "wss://relay.example/t/a=b/",
  ])
    assertOk(RelayUrl.fromUnknown(url), url);

  for (const url of ["wss://relay.example/?token=1", "wss://relay.example/?"]) {
    const result = RelayUrl.fromUnknown(url);
    assertErr(result, { type: "RelayUrl", value: url });
    assertEqual(
      RelayUrl.formatError(result.error),
      `The value "${url}" is not a relay URL, which has no query.`,
    );
  }

  // Its parents reject other spellings and URLs.
  assertErr(RelayUrl.fromUnknown("wss://free.evoluhq.com"), {
    type: "Url",
    value: "wss://free.evoluhq.com",
  });
  assertErr(RelayUrl.fromUnknown("https://free.evoluhq.com/"), {
    type: "WebSocketUrl",
    value: "https://free.evoluhq.com/",
  });
});

test("RelayUrlFromString transforms relay URLs to their canonical spelling", () => {
  assertOk(
    RelayUrlFromString.fromUnknown(" WSS://Free.EvoluHQ.com:443 "),
    "wss://free.evoluhq.com/",
  );
  assertOk(
    RelayUrlFromString.fromUnknown("ws://localhost:4000"),
    "ws://localhost:4000/",
  );

  for (const value of [
    "free.evoluhq.com",
    "https://free.evoluhq.com",
    "wss://free.evoluhq.com/#sync",
    "wss://free.evoluhq.com?token=1",
  ]) {
    const result = RelayUrlFromString.fromUnknown(value);
    assertErr(result, { type: "RelayUrlFromString", value });
    assertEqual(
      RelayUrlFromString.formatError(result.error),
      `The value "${value}" is not a valid relay URL.`,
    );
  }
});

test("RelayUrlFromString encodes the canonical spelling", () => {
  const url = RelayUrl.orThrow("wss://free.evoluhq.com/");
  assertEqual(RelayUrlFromString.to(url), url);
});

test("createOwnerWebSocketTransport adds the OwnerId as the query of a canonical URL", () => {
  for (const [relayUrl, expected] of [
    ["wss://free.evoluhq.com/", "wss://free.evoluhq.com/?ownerId="],
    ["wss://relay.example/sync", "wss://relay.example/sync?ownerId="],
  ] as const) {
    const transport = createOwnerWebSocketTransport({
      url: RelayUrl.orThrow(relayUrl),
      ownerId: testAppOwner.id,
    });
    assertEqual(transport, {
      type: "WebSocket",
      url: `${expected}${testAppOwner.id}`,
    });
    assertTrue(WebSocketUrl.is(transport.url));
    assertEqual(
      parseOwnerIdFromOwnerWebSocketTransportUrl(transport.url),
      testAppOwner.id,
    );
  }

  createOwnerWebSocketTransport({
    // @ts-expect-error createOwnerWebSocketTransport takes a RelayUrl, not a string.
    url: "wss://free.evoluhq.com/",
    ownerId: testAppOwner.id,
  });
  createOwnerWebSocketTransport({
    // @ts-expect-error A WebSocketUrl can have a query, which a RelayUrl can't.
    url: WebSocketUrl.orThrow("wss://free.evoluhq.com/"),
    ownerId: testAppOwner.id,
  });
});

test("parseOwnerIdFromOwnerWebSocketTransportUrl reads only the ownerId query parameter", () => {
  const id = testAppOwner.id;
  for (const url of [
    `/?ownerId=${id}`,
    `/sync?ownerId=${id}`,
    `/?ownerId=${id}&token=1`,
    `/?token=1&ownerId=${id}`,
    `/t/a=b/?ownerId=${id}`,
  ])
    assertEqual(parseOwnerIdFromOwnerWebSocketTransportUrl(url), id);

  for (const url of [
    "/",
    `/${id}`,
    `/?foo=${id}`,
    `/?ownerId=${id}&ownerId=${id}`,
    "/?ownerId=",
    "/?ownerId=invalid",
    // Only the first "?" starts the query.
    `/a&ownerId=${id}`,
    `/?x=?ownerId=${id}`,
  ])
    assertEqual(parseOwnerIdFromOwnerWebSocketTransportUrl(url), null);
});
