// This file should be generated from a script.
// [Playground Link](https://kyse.link/?p=b&i=haFkpnNxbGl0ZaF2pjAuMjYuMKFz2alpbXBvcnQgeyBHZW5lcmF0ZWQgfSBmcm9tICdreXNlbHknCgpkZWNsYXJlIGdsb2JhbCB7CiAgaW50ZXJmYWNlIERCIHsKICAgIF9fb3duZXI6IHsKICAgICAgaWQ6IHN0cmluZwogICAgICBtbmVtb25pYzogc3RyaW5nCiAgICAgIGVuY3J5cHRpb25LZXk6IFVpbnQ4QXJyYXkKICAgIH0gCiAgfQp9oXHZ_GF3YWl0IGt5c2VseS5zY2hlbWEKICAuY3JlYXRlVGFibGUoJ19fb3duZXInKQogIC5hZGRDb2x1bW4oJ2lkJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ21uZW1vbmljJywgJ2Jsb2InKQogIC5hZGRDb2x1bW4oJ2VuY3J5cHRpb25LZXknLCAnYmxvYicpCiAgLmV4ZWN1dGUoKQoKYXdhaXQga3lzZWx5LnNlbGVjdEZyb20oIl9fb3duZXIiKQogIC5zZWxlY3QoWyJpZCIsICJtbmVtb25pYyIsICJlbmNyeXB0aW9uS2V5Il0pCiAgLmV4ZWN1dGUoKaFjww==)

export const createTableOwner = (): string => `
CREATE TABLE
  "__owner" ("id" blob, "mnemonic" blob, "encryptionKey" blob)
`;

export const selectOwner = (): string => `
SELECT
  "id",
  "mnemonic",
  "encryptionKey"
FROM
  "__owner"
`;
