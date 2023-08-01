// TODO: This file should be generated from a script via Kysely.
// The reason for not using Kysely directly is bundle size.
// [Playground Link](https://kyse.link/?p=b&i=haFkpnNxbGl0ZaF2pjAuMjYuMKFz2fJpbXBvcnQgeyBHZW5lcmF0ZWQgfSBmcm9tICdreXNlbHknCgpkZWNsYXJlIGdsb2JhbCB7CiAgaW50ZXJmYWNlIERCIHsKICAgIF9fb3duZXI6IHsKICAgICAgaWQ6IHN0cmluZwogICAgICBtbmVtb25pYzogc3RyaW5nCiAgICAgIGVuY3J5cHRpb25LZXk6IFVpbnQ4QXJyYXkKICAgIH0sCgogICAgX19jbG9jazogewogICAgICB0aW1lc3RhbXA6IHN0cmluZywKICAgICAgbWVya2xlVHJlZTogc3RyaW5nCiAgICB9IAogIH0KfaFx2gPyYXdhaXQga3lzZWx5LnNlbGVjdEZyb20oIl9fb3duZXIiKQogIC5zZWxlY3QoWyJpZCIsICJtbmVtb25pYyIsICJlbmNyeXB0aW9uS2V5Il0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVUYWJsZSgnX19tZXNzYWdlJykKICAuYWRkQ29sdW1uKCd0aW1lc3RhbXAnLCAnYmxvYicsIGNvbCA9PiBjb2wucHJpbWFyeUtleSgpKQogIC5hZGRDb2x1bW4oJ3RhYmxlJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3JvdycsICdibG9iJykKICAuYWRkQ29sdW1uKCdjb2x1bW4nLCAnYmxvYicpCiAgLmFkZENvbHVtbigndmFsdWUnLCAnYmxvYicpCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVJbmRleCgiaW5kZXhfX21lc3NhZ2UiKQogIC5vbigiX19tZXNzYWdlIikKICAuY29sdW1ucyhbInRhYmxlIiwgInJvdyIsICJjb2x1bW4iLCAidGltZXN0YW1wIl0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVUYWJsZSgnX19jbG9jaycpCiAgLmFkZENvbHVtbigndGltZXN0YW1wJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ21lcmtsZVRyZWUnLCAnYmxvYicpCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5Lmluc2VydEludG8oIl9fY2xvY2siKQogIC52YWx1ZXMoewogICAgInRpbWVzdGFtcCI6ICJhIiwKICAgICJtZXJrbGVUcmVlIjogImIiCiAgfSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2NoZW1hCiAgLmNyZWF0ZVRhYmxlKCdfX293bmVyJykKICAuYWRkQ29sdW1uKCdpZCcsICdibG9iJykKICAuYWRkQ29sdW1uKCdtbmVtb25pYycsICdibG9iJykKICAuYWRkQ29sdW1uKCdlbmNyeXB0aW9uS2V5JywgJ2Jsb2InKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5pbnNlcnRJbnRvKCJfX293bmVyIikKICAudmFsdWVzKHsKICAgICJtbmVtb25pYyI6ICJhIiwKICAgICJpZCI6ICJiIiwKICAgICJlbmNyeXB0aW9uS2V5IjogbmV3IFVpbnQ4QXJyYXkoKQogIH0pCiAgLmV4ZWN1dGUoKQqhY8M=)

import { MerkleTreeString } from "./MerkleTree.js";
import { TimestampString } from "./Timestamp.js";

export const selectOwner = `
SELECT
  "id",
  "mnemonic",
  "encryptionKey"
FROM
  "__owner"
`;

export const initDb = (
  initialTimestamp: TimestampString,
  initialMerkleTree: MerkleTreeString
): string => `
CREATE TABLE
  "__message" (
    "timestamp" blob PRIMARY KEY,
    "table" blob,
    "row" blob,
    "column" blob,
    "value" blob
  );

CREATE INDEX "index__message" ON "__message" ("table", "row", "column", "timestamp");

CREATE TABLE
  "__clock" ("timestamp" blob, "merkleTree" blob);

INSERT INTO
  "__clock" ("timestamp", "merkleTree")
VALUES
  ('${initialTimestamp}', '${initialMerkleTree}');

CREATE TABLE
  "__owner" ("id" blob, "mnemonic" blob, "encryptionKey" blob);

INSERT INTO
  "__owner" ("mnemonic", "id", "encryptionKey")
VALUES
  (?, ?, ?);
`;
