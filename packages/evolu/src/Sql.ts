// TODO: This file should be generated from a script via Kysely.
// The reason for not using Kysely directly is bundle size.
// [Playground Link](https://kyse.link/?p=b&i=haFkpnNxbGl0ZaF2pjAuMjYuMKFz2gGBaW1wb3J0IHsgR2VuZXJhdGVkIH0gZnJvbSAna3lzZWx5JwoKZGVjbGFyZSBnbG9iYWwgewogIGludGVyZmFjZSBEQiB7CiAgICBldm9sdV9fbWVzc2FnZTogewogICAgICB0aW1lc3RhbXA6IHN0cmluZywKICAgICAgdGFibGU6IHN0cmluZywKICAgICAgcm93OiBzdHJpbmcsCiAgICAgIGNvbHVtbjogc3RyaW5nLAogICAgICB2YWx1ZTogdW5rbm93biwKICAgICAgdmVyc2lvbjogbnVtYmVyCiAgICB9LAoKICAgIGV2b2x1X19vd25lcjogewogICAgICBpZDogc3RyaW5nCiAgICAgIG1uZW1vbmljOiBzdHJpbmcKICAgICAgZW5jcnlwdGlvbktleTogVWludDhBcnJheSwKICAgICAgdGltZXN0YW1wOiBzdHJpbmcsCiAgICAgIG1lcmtsZVRyZWU6IHN0cmluZwogICAgfQogIH0KfaFx2gayYXdhaXQga3lzZWx5LnNlbGVjdEZyb20oImV2b2x1X19vd25lciIpCiAgLnNlbGVjdChbImlkIiwgIm1uZW1vbmljIiwgImVuY3J5cHRpb25LZXkiXSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2NoZW1hCiAgLmNyZWF0ZVRhYmxlKCdldm9sdV9fbWVzc2FnZScpCiAgLmFkZENvbHVtbigndGltZXN0YW1wJywgJ2Jsb2InLCBjb2wgPT4gY29sLnByaW1hcnlLZXkoKSkKICAuYWRkQ29sdW1uKCd0YWJsZScsICdibG9iJykKICAuYWRkQ29sdW1uKCdyb3cnLCAnYmxvYicpCiAgLmFkZENvbHVtbignY29sdW1uJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3ZhbHVlJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3ZlcnNpb24nLCAnYmxvYicpCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVJbmRleCgiaW5kZXhfX2V2b2x1X19tZXNzYWdlIikKICAub24oImV2b2x1X19tZXNzYWdlIikKICAuY29sdW1ucyhbInRhYmxlIiwgInJvdyIsICJjb2x1bW4iLCAidGltZXN0YW1wIl0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVUYWJsZSgnZXZvbHVfX293bmVyJykKICAuYWRkQ29sdW1uKCdpZCcsICdibG9iJykKICAuYWRkQ29sdW1uKCdtbmVtb25pYycsICdibG9iJykKICAuYWRkQ29sdW1uKCdlbmNyeXB0aW9uS2V5JywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3RpbWVzdGFtcCcsICdibG9iJykKICAuYWRkQ29sdW1uKCdtZXJrbGVUcmVlJywgJ2Jsb2InKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5pbnNlcnRJbnRvKCJldm9sdV9fb3duZXIiKQogIC52YWx1ZXMoewogICAgImlkIjogImIiLAogICAgIm1uZW1vbmljIjogImEiLAogICAgImVuY3J5cHRpb25LZXkiOiBuZXcgVWludDhBcnJheSgpLAogICAgInRpbWVzdGFtcCI6ICJhIiwKICAgICJtZXJrbGVUcmVlIjogImIiCiAgfSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgiZXZvbHVfX293bmVyIikKICAuc2VsZWN0KFsidGltZXN0YW1wIiwgIm1lcmtsZVRyZWUiXSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgiZXZvbHVfX21lc3NhZ2UiKQogIC5zZWxlY3QoInRpbWVzdGFtcCIpCiAgLndoZXJlKCd0YWJsZScsICc9JywgJzEnKQogIC53aGVyZSgncm93JywgJz0nLCAnMicpCiAgLndoZXJlKCdjb2x1bW4nLCAnPScsICczJykKICAub3JkZXJCeSgidGltZXN0YW1wIiwgImRlc2MiKQogIC5saW1pdCgxKQogIC5leGVjdXRlVGFrZUZpcnN0KCkKCmF3YWl0IGt5c2VseS5pbnNlcnRJbnRvKCJldm9sdV9fbWVzc2FnZSIpCiAgLnZhbHVlcyh7CiAgICAidGltZXN0YW1wIjogJzEnLAogICAgInRhYmxlIjogJzInLAogICAgInJvdyI6ICczJywKICAgICJjb2x1bW4iOiAnNCcsCiAgICAidmFsdWUiOiAnNScsCiAgICAidmVyc2lvbiI6IDEKICB9KQogIC5vbkNvbmZsaWN0KG9jID0-IG9jLmRvTm90aGluZygpKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS51cGRhdGVUYWJsZSgiZXZvbHVfX293bmVyIikKICAuc2V0KHsKICAgICJtZXJrbGVUcmVlIjogJzEnLAogICAgInRpbWVzdGFtcCI6ICIyIgogIH0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNlbGVjdEZyb20oImV2b2x1X19tZXNzYWdlIikKICAuc2VsZWN0QWxsKCkKICAud2hlcmUoInRpbWVzdGFtcCIsICI-PSIsIDEpCiAgLm9yZGVyQnkoInRpbWVzdGFtcCIpCiAgLmV4ZWN1dGUoKaFjww==)
// Note tables are prefixed with nanoid to avoid potential clashes.

export const selectOwner = `
SELECT
  "id",
  "mnemonic",
  "encryptionKey"
FROM
  "evolu__owner"
`;

export const createMessageTable = `
CREATE TABLE
  "evolu__message" (
    "timestamp" blob PRIMARY KEY,
    "table" blob,
    "row" blob,
    "column" blob,
    "value" blob,
    "version" blob
  );
`;

export const createMessageTableIndex = `
CREATE INDEX "index_evolu__message" ON "evolu__message" (
  "table", "row", "column", "timestamp"
);
`;

export const createOwnerTable = `
CREATE TABLE
  "evolu__owner" (
    "id" blob,
    "mnemonic" blob,
    "encryptionKey" blob,
    "timestamp" blob,
    "merkleTree" blob
  );
`;

export const insertOwner = `
INSERT INTO
  "evolu__owner" (
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
  "evolu__owner"
`;

export const selectLastTimestampForTableRowColumn = `
SELECT
  "timestamp"
FROM
  "evolu__message"
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
  column: string,
): string => `
INSERT INTO
  "${table}" ("id", "${column}")
VALUES
  (?, ?)
ON CONFLICT DO UPDATE SET
  "${column}" = ?
`;

export const insertIntoMessagesIfNew = `
INSERT INTO
  "evolu__message" ("timestamp", "table", "row", "column", "value", "version")
VALUES
  (?, ?, ?, ?, ?, ?)
ON CONFLICT DO NOTHING
`;

export const updateOwnerTimestampAndMerkleTree = `
UPDATE "evolu__owner"
SET
  "timestamp" = ?,
  "merkleTree" = ?
`;

export const selectMessagesToSync = `
SELECT
  *
FROM
  "evolu__message"
WHERE
  "timestamp" >= ?
ORDER BY
  "timestamp"
`;
