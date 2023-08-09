// TODO: This file should be generated from a script via Kysely.
// The reason for not using Kysely directly is bundle size.
// [Playground Link](https://kyse.link/?p=b&i=haFkpnNxbGl0ZaF2pjAuMjYuMKFz2gF2aW1wb3J0IHsgR2VuZXJhdGVkIH0gZnJvbSAna3lzZWx5JwoKZGVjbGFyZSBnbG9iYWwgewogIGludGVyZmFjZSBEQiB7CiAgICBfX293bmVyOiB7CiAgICAgIGlkOiBzdHJpbmcKICAgICAgbW5lbW9uaWM6IHN0cmluZwogICAgICBlbmNyeXB0aW9uS2V5OiBVaW50OEFycmF5CiAgICB9LAoKICAgIF9fY2xvY2s6IHsKICAgICAgdGltZXN0YW1wOiBzdHJpbmcsCiAgICAgIG1lcmtsZVRyZWU6IHN0cmluZwogICAgfQoKICAgIF9fbWVzc2FnZTogewogICAgICB0aW1lc3RhbXA6IHN0cmluZywKICAgICAgdGFibGU6IHN0cmluZywKICAgICAgcm93OiBzdHJpbmcsCiAgICAgIGNvbHVtbjogc3RyaW5nLAogICAgICB2YWx1ZTogdW5rbm93bgogICAgfSAKICB9Cn2hcdoGQmF3YWl0IGt5c2VseS5zZWxlY3RGcm9tKCJfX293bmVyIikKICAuc2VsZWN0KFsiaWQiLCAibW5lbW9uaWMiLCAiZW5jcnlwdGlvbktleSJdKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlVGFibGUoJ19fbWVzc2FnZScpCiAgLmFkZENvbHVtbigndGltZXN0YW1wJywgJ2Jsb2InLCBjb2wgPT4gY29sLnByaW1hcnlLZXkoKSkKICAuYWRkQ29sdW1uKCd0YWJsZScsICdibG9iJykKICAuYWRkQ29sdW1uKCdyb3cnLCAnYmxvYicpCiAgLmFkZENvbHVtbignY29sdW1uJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3ZhbHVlJywgJ2Jsb2InKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlSW5kZXgoImluZGV4X19tZXNzYWdlIikKICAub24oIl9fbWVzc2FnZSIpCiAgLmNvbHVtbnMoWyJ0YWJsZSIsICJyb3ciLCAiY29sdW1uIiwgInRpbWVzdGFtcCJdKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlVGFibGUoJ19fY2xvY2snKQogIC5hZGRDb2x1bW4oJ3RpbWVzdGFtcCcsICdibG9iJykKICAuYWRkQ29sdW1uKCdtZXJrbGVUcmVlJywgJ2Jsb2InKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5pbnNlcnRJbnRvKCJfX2Nsb2NrIikKICAudmFsdWVzKHsKICAgICJ0aW1lc3RhbXAiOiAiYSIsCiAgICAibWVya2xlVHJlZSI6ICJiIgogIH0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVUYWJsZSgnX19vd25lcicpCiAgLmFkZENvbHVtbignaWQnLCAnYmxvYicpCiAgLmFkZENvbHVtbignbW5lbW9uaWMnLCAnYmxvYicpCiAgLmFkZENvbHVtbignZW5jcnlwdGlvbktleScsICdibG9iJykKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuaW5zZXJ0SW50bygiX19vd25lciIpCiAgLnZhbHVlcyh7CiAgICAibW5lbW9uaWMiOiAiYSIsCiAgICAiaWQiOiAiYiIsCiAgICAiZW5jcnlwdGlvbktleSI6IG5ldyBVaW50OEFycmF5KCkKICB9KQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zZWxlY3RGcm9tKCJfX2Nsb2NrIikKICAuc2VsZWN0KFsidGltZXN0YW1wIiwgIm1lcmtsZVRyZWUiXSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgiX19tZXNzYWdlIikKICAuc2VsZWN0KCJ0aW1lc3RhbXAiKQogIC53aGVyZSgndGFibGUnLCAnPScsICcxJykKICAud2hlcmUoJ3JvdycsICc9JywgJzInKQogIC53aGVyZSgnY29sdW1uJywgJz0nLCAnMycpCiAgLm9yZGVyQnkoInRpbWVzdGFtcCIsICJkZXNjIikKICAubGltaXQoMSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuaW5zZXJ0SW50bygiX19tZXNzYWdlIikKICAudmFsdWVzKHsKICAgICJ0aW1lc3RhbXAiOiAnMScsCiAgICAidGFibGUiOiAnMicsCiAgICAicm93IjogJzMnLAogICAgImNvbHVtbiI6ICc0JywKICAgICJ2YWx1ZSI6ICc1JwogIH0pCiAgLm9uQ29uZmxpY3Qob2MgPT4gb2MuZG9Ob3RoaW5nKCkpCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnVwZGF0ZVRhYmxlKCJfX2Nsb2NrIikKICAuc2V0KHsKICAgICJtZXJrbGVUcmVlIjogJzEnLAogICAgInRpbWVzdGFtcCI6ICIyIgogIH0pCiAgLmV4ZWN1dGUoKaFjww==)

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

export const selectClock = `
SELECT
  "timestamp",
  "merkleTree"
FROM
  "__clock"
`;

export const selectTimestamp = `
SELECT
  "timestamp"
FROM
  "__message"
WHERE
  "table" = ?
  AND "row" = ?
  AND "column" = ?
ORDER BY
  "timestamp" DESC
LIMIT
  1
`;

export const insertValueIntoTableColumn = (
  table: string,
  column: string
): string => `
INSERT INTO
  "${table}" ("id", "${column}")
VALUES
  (?, ?)
ON CONFLICT DO UPDATE SET
  "${column}" = ?
`;

export const tryInsertIntoMessages = `
INSERT INTO
  "__message" ("timestamp", "table", "row", "column", "value")
VALUES
  (?, ?, ?, ?, ?)
ON CONFLICT DO NOTHING
`;

export const updateClock = `
UPDATE "__clock"
SET
  "timestamp" = ?,
  "merkleTree" = ?
`;
