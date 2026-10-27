# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

## Node.js 24.22.0, node:24.22.0-trixie-slim (Debian 13, glibc) on arm64

Run 2026-10-27T10:29:10.697Z. CPU unknown, 4 cores, 6 GiB; OS Linux 6.8.0-100-generic arm64; Node.js 24.22.0; C library glibc 2.41; Checkout 0a9a95ebc with uncommitted changes; Host Apple M5, 10 cores, 16 GiB; macOS 26.6.2 arm64; Container node:24.22.0-trixie-slim (Debian 13, glibc).

Load averages: 0.32, 0.07, 0.02 before, 0.94, 0.29, 0.10 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |   787 (714–3740) |   866 (828–1013) |   944 (731–4710) |   931 (699–5117) |
| 2. 25000 INSERTs in a transaction               | 21.0 (16.5–54.6) | 19.9 (17.4–23.4) |  21.5 (17.9–104) | 16.6 (15.8–28.2) |
| 3. 25000 INSERTs into an indexed table          |  30.5 (29.4–112) | 32.5 (29.6–34.6) |  31.0 (27.7–176) | 27.1 (25.5–27.4) |
| 4. 100 SELECTs without an index                 | 51.3 (51.0–52.7) | 51.1 (51.1–51.3) | 40.9 (40.3–41.0) | 40.9 (39.8–41.1) |
| 5. 100 SELECTs on a string comparison           |    177 (175–183) |    177 (177–178) |    164 (163–164) |    160 (158–162) |
| 6. Creating an index                            | 9.33 (8.76–29.4) | 9.96 (9.31–10.5) | 9.21 (8.22–52.8) | 8.91 (8.48–18.1) |
| 7. 5000 SELECTs with an index                   | 7.51 (7.44–8.99) | 7.82 (7.10–8.01) | 7.42 (7.19–7.59) | 7.01 (6.80–7.27) |
| 8. 1000 UPDATEs without an index                | 12.8 (12.5–21.5) | 12.8 (12.6–13.3) | 11.4 (11.1–40.8) | 11.4 (11.1–13.1) |
| 9. 25000 UPDATEs with an index                  |  41.7 (40.4–128) | 45.7 (43.6–45.8) |  42.2 (39.1–224) | 38.9 (37.8–39.6) |
| 10. 25000 text UPDATEs with an index            |  29.8 (27.7–112) | 33.4 (32.3–35.0) |  31.0 (29.6–192) | 28.4 (27.4–28.5) |
| 11. INSERTs from a SELECT                       |  19.8 (18.8–168) | 28.3 (25.4–32.9) |  18.6 (17.1–164) | 18.2 (17.2–19.8) |
| 12. DELETE without an index                     |  13.3 (12.2–152) | 24.1 (23.2–31.0) | 12.6 (12.0–16.6) | 12.5 (11.4–14.2) |
| 13. DELETE with an index                        | 15.3 (14.7–17.1) | 27.3 (26.7–27.7) | 14.3 (14.0–18.0) | 14.3 (13.9–17.6) |
| 14. A big INSERT after a big DELETE             | 14.7 (14.6–16.3) | 18.8 (18.2–19.1) | 13.8 (13.6–14.3) | 13.7 (13.5–16.4) |
| 15. A big DELETE followed by many small INSERTs | 9.41 (8.53–9.70) | 13.9 (13.3–14.6) | 9.32 (8.68–10.5) | 8.28 (7.80–12.8) |
| 16. DROP TABLE                                  | 3.85 (3.20–5.08) | 28.1 (27.0–28.9) | 3.85 (3.31–9.38) | 3.58 (3.28–10.8) |
| Total                                           | 1243 (1172–4802) | 1384 (1361–1545) | 1376 (1146–5932) | 1345 (1107–5566) |
| Total without 1                                 |   459 (453–1062) |    532 (519–545) |   432 (416–1222) |    410 (407–449) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.40 (0.34–0.41) | 0.48 (0.36–0.64) | 0.47 (0.45–0.50) | 0.30 (0.30–0.33) |
| 10000 point selects      | 0.50 (0.43–0.65) | 0.46 (0.41–0.51) | 0.44 (0.37–0.45) | 0.49 (0.44–0.68) |
| 10 reads of 10000 rows   | 1.15 (0.75–1.96) | 1.07 (0.89–1.39) | 1.33 (1.11–1.38) | 2.22 (1.49–2.85) |

### Evolu relative to better-sqlite3

The median over rounds of Evolu's time divided by better-sqlite3's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / better-sqlite3 |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ---------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |       0.91 (0.28–1.07) |        |         1.06 (0.25–1.21) |
| 2. 25000 INSERTs in a transaction               |       0.97 (0.53–1.17) |        |         0.95 (0.33–1.41) |
| 3. 25000 INSERTs into an indexed table          |       1.00 (0.64–1.10) |        |         1.01 (0.31–1.08) |
| 4. 100 SELECTs without an index                 |       1.26 (1.25–1.31) | slower |         1.00 (0.97–1.00) |
| 5. 100 SELECTs on a string comparison           |       1.08 (1.07–1.11) |        |         1.00 (0.97–1.01) |
| 6. Creating an index                            |       1.08 (0.56–1.14) |        |         1.00 (0.35–1.08) |
| 7. 5000 SELECTs with an index                   |       1.04 (0.99–1.25) |        |         1.04 (0.79–1.07) |
| 8. 1000 UPDATEs without an index                |       1.13 (0.53–1.13) |        |         1.01 (0.61–1.04) |
| 9. 25000 UPDATEs with an index                  |       0.96 (0.57–1.06) |        |         1.08 (0.35–1.13) |
| 10. 25000 text UPDATEs with an index            |       0.94 (0.58–0.98) |        |         1.15 (0.30–1.26) |
| 11. INSERTs from a SELECT                       |       1.06 (0.90–1.16) |        |         1.31 (0.17–1.76) |
| 12. DELETE without an index                     |       1.08 (0.85–9.20) |        |         1.79 (0.16–2.54) |
| 13. DELETE with an index                        |       1.08 (0.82–1.22) |        |         1.74 (1.61–1.85) |
| 14. A big INSERT after a big DELETE             |       1.08 (1.07–1.14) |        |         1.26 (1.15–1.28) |
| 15. A big DELETE followed by many small INSERTs |       1.00 (0.81–1.04) |        |         1.49 (1.37–1.68) |
| 16. DROP TABLE                                  |       0.99 (0.54–1.24) |        |         7.29 (5.43–8.45) |
| Total                                           |       0.97 (0.38–1.08) |        |         1.10 (0.31–1.18) |
| Total without 1                                 |       1.06 (0.87–1.09) |        |         1.16 (0.50–1.20) |
| 10000 single-row inserts                        |       0.81 (0.74–0.88) | faster |         1.19 (0.91–1.88) |
| 10000 point selects                             |       1.28 (0.97–1.62) |        |         1.01 (0.63–1.08) |
| 10 reads of 10000 rows                          |       0.84 (0.54–1.49) |        |         0.93 (0.52–1.86) |

**Verdict:** Evolu is slower than better-sqlite3 in 4. 100 SELECTs without an index.

### SQLite and pragmas

Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.

| Stack            | Library                      | Binding                                 | SQLite | Source ID                      | page_size | journal_mode | synchronous | cache_size | temp_store | secure_delete | locking_mode | auto_vacuum | mmap_size |
| ---------------- | ---------------------------- | --------------------------------------- | ------ | ------------------------------ | --------- | ------------ | ----------- | ---------- | ---------- | ------------- | ------------ | ----------- | --------- |
| Evolu            | Evolu's SQLite               | Node-API (@evolu/nodejs), unix VFS      | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| Evolu, encrypted | Evolu's SQLite               | Node-API (@evolu/nodejs), Evolu's codec | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 1 (ON)        | normal       | 0 (NONE)    | 0         |
| better-sqlite3   | better-sqlite3 13.0.3        | Node-API (node-addon-api), unix VFS     | 3.53.4 | 2026-07-24 19:02:57 bf7c7f3003 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| node:sqlite      | node:sqlite, Node.js 24.22.0 | built into Node.js, unix VFS            | 3.53.4 | 2026-07-24 19:02:57 bf7c7f3003 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |

### Compile options that differ

An empty cell is an option the build doesn't report.

| Option                     | Evolu        | Evolu, encrypted | better-sqlite3 | node:sqlite                            |
| -------------------------- | ------------ | ---------------- | -------------- | -------------------------------------- |
| COMPILER                   | clang-21.1.8 | clang-21.1.8     | gcc-11.4.0     | gcc-12.2.1 20221121 (Red Hat 12.2.1-7) |
| DEFAULT_CACHE_SIZE         | -2000        | -2000            | -16000         | -2000                                  |
| DEFAULT_FOREIGN_KEYS       |              |                  | set            |                                        |
| DEFAULT_WAL_SYNCHRONOUS    | 2            | 2                | 1              | 2                                      |
| DQS                        | 0            | 0                | 0              |                                        |
| ENABLE_COLUMN_METADATA     |              |                  | set            | set                                    |
| ENABLE_DBSTAT_VTAB         |              |                  | set            | set                                    |
| ENABLE_FTS3                |              |                  | set            | set                                    |
| ENABLE_FTS3_PARENTHESIS    |              |                  | set            | set                                    |
| ENABLE_FTS4                |              |                  | set            |                                        |
| ENABLE_FTS5                |              |                  | set            | set                                    |
| ENABLE_GEOPOLY             |              |                  | set            | set                                    |
| ENABLE_LOCKING_STYLE       | 0            | 0                |                |                                        |
| ENABLE_PERCENTILE          |              |                  | set            | set                                    |
| ENABLE_PREUPDATE_HOOK      |              |                  |                | set                                    |
| ENABLE_RBU                 |              |                  |                | set                                    |
| ENABLE_RTREE               |              |                  | set            | set                                    |
| ENABLE_SESSION             |              |                  |                | set                                    |
| ENABLE_STAT4               |              |                  | set            |                                        |
| ENABLE_UPDATE_DELETE_LIMIT |              |                  | set            |                                        |
| LIKE_DOESNT_MATCH_BLOBS    |              |                  | set            |                                        |
| MAX_SCHEMA                 | 10000000     | 10000000         |                |                                        |
| MAX_WORKER_THREADS         | 0            | 0                | 8              | 8                                      |
| OMIT_DEPRECATED            |              |                  | set            |                                        |
| OMIT_INCRBLOB              | set          | set              |                |                                        |
| OMIT_INTROSPECTION_PRAGMAS | set          | set              |                |                                        |
| OMIT_LOAD_EXTENSION        | set          | set              |                |                                        |
| OMIT_PROGRESS_CALLBACK     | set          | set              | set            |                                        |
| OMIT_SHARED_CACHE          |              |                  | set            |                                        |
| OMIT_TCL_VARIABLE          |              |                  | set            |                                        |
| SOUNDEX                    |              |                  | set            |                                        |
| TEMP_STORE                 | 3            | 3                | 1              | 1                                      |
| THREADSAFE                 | 2            | 2                | 2              | 1                                      |
| USE_URI                    |              |                  | set            |                                        |
