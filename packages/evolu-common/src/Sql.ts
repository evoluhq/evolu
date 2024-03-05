// TODO: This file should be generated from a script via Kysely.
// The reason for not using Kysely directly is bundle size.
// [Playground Link](https://kyse.link/?p=b&i=haFkpnNxbGl0ZaF2pjAuMjYuMKFz2gFoaW1wb3J0IHsgR2VuZXJhdGVkIH0gZnJvbSAna3lzZWx5JwoKZGVjbGFyZSBnbG9iYWwgewogIGludGVyZmFjZSBEQiB7CiAgICBldm9sdV9tZXNzYWdlOiB7CiAgICAgIHRpbWVzdGFtcDogc3RyaW5nLAogICAgICB0YWJsZTogc3RyaW5nLAogICAgICByb3c6IHN0cmluZywKICAgICAgY29sdW1uOiBzdHJpbmcsCiAgICAgIHZhbHVlOiB1bmtub3duCiAgICB9LAoKICAgIGV2b2x1X293bmVyOiB7CiAgICAgIGlkOiBzdHJpbmcKICAgICAgbW5lbW9uaWM6IHN0cmluZwogICAgICBlbmNyeXB0aW9uS2V5OiBVaW50OEFycmF5LAogICAgICB0aW1lc3RhbXA6IHN0cmluZywKICAgICAgbWVya2xlVHJlZTogc3RyaW5nCiAgICB9CiAgfQp9oXHaBnhhd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgiZXZvbHVfb3duZXIiKQogIC5zZWxlY3QoWyJpZCIsICJtbmVtb25pYyIsICJlbmNyeXB0aW9uS2V5Il0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNjaGVtYQogIC5jcmVhdGVUYWJsZSgnZXZvbHVfbWVzc2FnZScpCiAgLmFkZENvbHVtbigndGltZXN0YW1wJywgJ2Jsb2InLCBjb2wgPT4gY29sLnByaW1hcnlLZXkoKSkKICAuYWRkQ29sdW1uKCd0YWJsZScsICdibG9iJykKICAuYWRkQ29sdW1uKCdyb3cnLCAnYmxvYicpCiAgLmFkZENvbHVtbignY29sdW1uJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ3ZhbHVlJywgJ2Jsb2InKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlSW5kZXgoImluZGV4X2V2b2x1X21lc3NhZ2UiKQogIC5vbigiZXZvbHVfbWVzc2FnZSIpCiAgLmNvbHVtbnMoWyJ0YWJsZSIsICJyb3ciLCAiY29sdW1uIiwgInRpbWVzdGFtcCJdKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlVGFibGUoJ2V2b2x1X19vd25lcicpCiAgLmFkZENvbHVtbignaWQnLCAnYmxvYicpCiAgLmFkZENvbHVtbignbW5lbW9uaWMnLCAnYmxvYicpCiAgLmFkZENvbHVtbignZW5jcnlwdGlvbktleScsICdibG9iJykKICAuYWRkQ29sdW1uKCd0aW1lc3RhbXAnLCAnYmxvYicpCiAgLmFkZENvbHVtbignbWVya2xlVHJlZScsICdibG9iJykKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuaW5zZXJ0SW50bygiZXZvbHVfb3duZXIiKQogIC52YWx1ZXMoewogICAgImlkIjogImIiLAogICAgIm1uZW1vbmljIjogImEiLAogICAgImVuY3J5cHRpb25LZXkiOiBuZXcgVWludDhBcnJheSgpLAogICAgInRpbWVzdGFtcCI6ICJhIiwKICAgICJtZXJrbGVUcmVlIjogImIiCiAgfSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkuc2VsZWN0RnJvbSgiZXZvbHVfb3duZXIiKQogIC5zZWxlY3QoWyJ0aW1lc3RhbXAiLCAibWVya2xlVHJlZSJdKQogIC5leGVjdXRlKCkKCmF3YWl0IGt5c2VseS5zZWxlY3RGcm9tKCJldm9sdV9tZXNzYWdlIikKICAuc2VsZWN0KCJ0aW1lc3RhbXAiKQogIC53aGVyZSgndGFibGUnLCAnPScsICcxJykKICAud2hlcmUoJ3JvdycsICc9JywgJzInKQogIC53aGVyZSgnY29sdW1uJywgJz0nLCAnMycpCiAgLm9yZGVyQnkoInRpbWVzdGFtcCIsICJkZXNjIikKICAubGltaXQoMSkKICAuZXhlY3V0ZVRha2VGaXJzdCgpCgphd2FpdCBreXNlbHkuaW5zZXJ0SW50bygiZXZvbHVfbWVzc2FnZSIpCiAgLnZhbHVlcyh7CiAgICAidGltZXN0YW1wIjogJzEnLAogICAgInRhYmxlIjogJzInLAogICAgInJvdyI6ICczJywKICAgICJjb2x1bW4iOiAnNCcsCiAgICAidmFsdWUiOiAnNScsCiAgfSkKICAub25Db25mbGljdChvYyA9PiBvYy5kb05vdGhpbmcoKSkKICAuZXhlY3V0ZSgpCgphd2FpdCBreXNlbHkudXBkYXRlVGFibGUoImV2b2x1X293bmVyIikKICAuc2V0KHsKICAgICJtZXJrbGVUcmVlIjogJzEnLAogICAgInRpbWVzdGFtcCI6ICIyIgogIH0pCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNlbGVjdEZyb20oImV2b2x1X21lc3NhZ2UiKQogIC5zZWxlY3RBbGwoKQogIC53aGVyZSgidGltZXN0YW1wIiwgIj49IiwgJzEnKQogIC5vcmRlckJ5KCJ0aW1lc3RhbXAiKQogIC5leGVjdXRlKCmhY8M=)

export const selectOwner = `
select
  "id",
  "mnemonic",
  "encryptionKey"
from
  "evolu_owner"
`.trim();

export const createMessageTable = `
create table
  "evolu_message" (
    "timestamp" blob primary key,
    "table" blob,
    "row" blob,
    "column" blob,
    "value" blob
  );
`.trim();

export const createMessageTableIndex = `
create index "index_evolu_message" on "evolu_message" (
  "table", "row", "column", "timestamp"
);
`.trim();

export const createOwnerTable = `
create table
  "evolu_owner" (
    "id" blob,
    "mnemonic" blob,
    "encryptionKey" blob,
    "timestamp" blob,
    "merkleTree" blob
  );
`.trim();

export const insertOwner = `
insert into
  "evolu_owner" (
    "id",
    "mnemonic",
    "encryptionKey",
    "timestamp",
    "merkleTree"
  )
values
  (?, ?, ?, ?, ?);
`.trim();

export const selectOwnerTimestampAndMerkleTree = `
select
  "timestamp",
  "merkleTree"
from
  "evolu_owner"
`.trim();

export const selectLastTimestampForTableRowColumn = `
select
  "timestamp"
from
  "evolu_message"
where
  "table" = ?
  and "row" = ?
  and "column" = ?
order by
  "timestamp" desc
limit
  1
`.trim();

export const upsertValueIntoTableRowColumn = (
  table: string,
  column: string,
): string =>
  `
insert into
  "${table}" ("id", "${column}", "createdAt", "updatedAt")
values
  (?, ?, ?, ?)
on conflict do update set
  "${column}" = ?,
  "updatedAt" = ?
`.trim();

export const deleteTableRow = (table: string): string =>
  `
delete from "${table}"
where
  "id" = ?;
`.trim();

export const insertIntoMessagesIfNew = `
insert into
  "evolu_message" ("timestamp", "table", "row", "column", "value")
values
  (?, ?, ?, ?, ?)
on conflict do nothing
`.trim();

export const updateOwnerTimestampAndMerkleTree = `
update "evolu_owner"
set
  "timestamp" = ?,
  "merkleTree" = ?
`.trim();

export const selectMessagesToSync = `
select
  *
from
  "evolu_message"
where
  "timestamp" >= ?
order by
  "timestamp"
`.trim();
