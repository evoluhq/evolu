// TODO: This file should be generated from a script via Kysely.
// The reason for not using Kysely directly is bundle size.
// [Playground Link](https://kyse.link/?p=b&i=haFkpnNxbGl0ZaF2pjAuMjYuMKFz2gGAaW1wb3J0IHsgR2VuZXJhdGVkIH0gZnJvbSAna3lzZWx5JwoKZGVjbGFyZSBnbG9iYWwgewogIGludGVyZmFjZSBEQiB7CiAgICB1TE1zUFJpNzhsTm15V2x0X19tZXNzYWdlOiB7CiAgICAgIHRpbWVzdGFtcDogc3RyaW5nLAogICAgICB0YWJsZTogc3RyaW5nLAogICAgICByb3c6IHN0cmluZywKICAgICAgY29sdW1uOiBzdHJpbmcsCiAgICAgIHZhbHVlOiB1bmtub3duCiAgICB9LAoKICAgIHVMTXNQUmk3OGxObXlXbHRfX293bmVyOiB7CiAgICAgIGlkOiBzdHJpbmcKICAgICAgbW5lbW9uaWM6IHN0cmluZwogICAgICBlbmNyeXB0aW9uS2V5OiBVaW50OEFycmF5LAogICAgICB0aW1lc3RhbXA6IHN0cmluZywKICAgICAgbWVya2xlVHJlZTogc3RyaW5nCiAgICB9CiAgfQp9oXHaBvlhd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgidUxNc1BSaTc4bE5teVdsdF9fb3duZXIiKQogIC5zZWxlY3QoWyJpZCIsICJtbmVtb25pYyIsICJlbmNyeXB0aW9uS2V5Il0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVUYWJsZSgndUxNc1BSaTc4bE5teVdsdF9fbWVzc2FnZScpCiAgLmFkZENvbHVtbigndGltZXN0YW1wJywgJ2Jsb2InLCBjb2wgPT4gY29sLnByaW1hcnlLZXkoKSkKICAuYWRkQ29sdW1uKCd0YWJsZScsICdibG9iJykKICAuYWRkQ29sdW1uKCdyb3cnLCAnYmxvYicpCiAgLmFkZENvbHVtbignY29sdW1uJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3ZhbHVlJywgJ2Jsb2InKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlSW5kZXgoImluZGV4X191TE1zUFJpNzhsTm15V2x0X19tZXNzYWdlIikKICAub24oInVMTXNQUmk3OGxObXlXbHRfX21lc3NhZ2UiKQogIC5jb2x1bW5zKFsidGFibGUiLCAicm93IiwgImNvbHVtbiIsICJ0aW1lc3RhbXAiXSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2NoZW1hCiAgLmNyZWF0ZVRhYmxlKCd1TE1zUFJpNzhsTm15V2x0X19vd25lcicpCiAgLmFkZENvbHVtbignaWQnLCAnYmxvYicpCiAgLmFkZENvbHVtbignbW5lbW9uaWMnLCAnYmxvYicpCiAgLmFkZENvbHVtbignZW5jcnlwdGlvbktleScsICdibG9iJykKICAuYWRkQ29sdW1uKCd0aW1lc3RhbXAnLCAnYmxvYicpCiAgLmFkZENvbHVtbignbWVya2xlVHJlZScsICdibG9iJykKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuaW5zZXJ0SW50bygidUxNc1BSaTc4bE5teVdsdF9fb3duZXIiKQogIC52YWx1ZXMoewogICAgImlkIjogImIiLAogICAgIm1uZW1vbmljIjogImEiLAogICAgImVuY3J5cHRpb25LZXkiOiBuZXcgVWludDhBcnJheSgpLAogICAgInRpbWVzdGFtcCI6ICJhIiwKICAgICJtZXJrbGVUcmVlIjogImIiCiAgfSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgidUxNc1BSaTc4bE5teVdsdF9fb3duZXIiKQogIC5zZWxlY3QoWyJ0aW1lc3RhbXAiLCAibWVya2xlVHJlZSJdKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zZWxlY3RGcm9tKCJ1TE1zUFJpNzhsTm15V2x0X19tZXNzYWdlIikKICAuc2VsZWN0KCJ0aW1lc3RhbXAiKQogIC53aGVyZSgndGFibGUnLCAnPScsICcxJykKICAud2hlcmUoJ3JvdycsICc9JywgJzInKQogIC53aGVyZSgnY29sdW1uJywgJz0nLCAnMycpCiAgLm9yZGVyQnkoInRpbWVzdGFtcCIsICJkZXNjIikKICAubGltaXQoMSkKICAuZXhlY3V0ZVRha2VGaXJzdCgpCgphd2FpdCBreXNlbHkuaW5zZXJ0SW50bygidUxNc1BSaTc4bE5teVdsdF9fbWVzc2FnZSIpCiAgLnZhbHVlcyh7CiAgICAidGltZXN0YW1wIjogJzEnLAogICAgInRhYmxlIjogJzInLAogICAgInJvdyI6ICczJywKICAgICJjb2x1bW4iOiAnNCcsCiAgICAidmFsdWUiOiAnNScKICB9KQogIC5vbkNvbmZsaWN0KG9jID0-IG9jLmRvTm90aGluZygpKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS51cGRhdGVUYWJsZSgidUxNc1BSaTc4bE5teVdsdF9fb3duZXIiKQogIC5zZXQoewogICAgIm1lcmtsZVRyZWUiOiAnMScsCiAgICAidGltZXN0YW1wIjogIjIiCiAgfSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgidUxNc1BSaTc4bE5teVdsdF9fbWVzc2FnZSIpCiAgLnNlbGVjdEFsbCgpCiAgLndoZXJlKCJ0aW1lc3RhbXAiLCAiPj0iLCAxKQogIC5vcmRlckJ5KCJ0aW1lc3RhbXAiKQogIC5leGVjdXRlKCmhY8M=)
// Note tables are prefixed with nanoid to avoid potential clashes.

export const selectOwner = `
SELECT
  "id",
  "mnemonic",
  "encryptionKey"
FROM
  "uLMsPRi78lNmyWlt__owner"
`;

export const initDb = `
CREATE TABLE
  "uLMsPRi78lNmyWlt__message" (
    "timestamp" blob PRIMARY KEY,
    "table" blob,
    "row" blob,
    "column" blob,
    "value" blob
  );

CREATE INDEX "indexuLMsPRi78lNmyWlt__message" ON "uLMsPRi78lNmyWlt__message" ("table", "row", "column", "timestamp");

CREATE TABLE
  "uLMsPRi78lNmyWlt__owner" (
    "id" blob,
    "mnemonic" blob,
    "encryptionKey" blob,
    "timestamp" blob,
    "merkleTree" blob
  );

INSERT INTO
  "uLMsPRi78lNmyWlt__owner" (
    "id",
    "mnemonic",
    "encryptionKey",
    "timestamp",
    "merkleTree"
  )
VALUES
  (?, ?, ?, ?, ?);
`;

export const selectOwnerTimestampAndMerkleTree = `
SELECT
  "timestamp",
  "merkleTree"
FROM
  "uLMsPRi78lNmyWlt__owner"
`;

export const selectLastTimestampForTableRowColumn = `
SELECT
  "timestamp"
FROM
  "uLMsPRi78lNmyWlt__message"
WHERE
  "table" = ?
  AND "row" = ?
  AND "column" = ?
ORDER BY
  "timestamp" DESC
LIMIT
  1
`;

export const insertValueIntoTableRowColumn = (
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
  "uLMsPRi78lNmyWlt__message" ("timestamp", "table", "row", "column", "value")
VALUES
  (?, ?, ?, ?, ?)
ON CONFLICT DO NOTHING
`;

export const updateOwnerTimestampAndMerkleTree = `
UPDATE "uLMsPRi78lNmyWlt__owner"
SET
  "timestamp" = ?,
  "merkleTree" = ?
`;

export const selectMessagesToSync = `
SELECT
  *
FROM
  "uLMsPRi78lNmyWlt__message"
WHERE
  "timestamp" >= ?
ORDER BY
  "timestamp"
`;
