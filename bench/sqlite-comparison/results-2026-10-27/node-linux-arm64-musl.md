# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

## Node.js 24.22.0, node:24.22.0-alpine (musl) on arm64

Run 2026-10-27T11:01:13.100Z. CPU unknown, 4 cores, 6 GiB; OS Linux 6.8.0-100-generic arm64; Node.js 24.22.0; C library musl; Checkout 0a9a95ebc with uncommitted changes; Host Apple M5, 10 cores, 16 GiB; macOS 26.6.2 arm64; Container node:24.22.0-alpine (musl).

Load averages: 0.26, 0.16, 0.06 before, 0.89, 0.34, 0.13 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |    747 (740–996) |    812 (754–999) |    768 (706–911) |   732 (711–1003) |
| 2. 25000 INSERTs in a transaction               | 17.6 (16.6–25.9) | 20.7 (19.1–23.7) | 19.4 (17.7–20.6) | 16.8 (15.6–17.2) |
| 3. 25000 INSERTs into an indexed table          | 31.2 (30.9–38.2) | 34.9 (34.5–41.4) | 33.5 (32.0–35.1) | 31.0 (30.0–32.0) |
| 4. 100 SELECTs without an index                 | 53.2 (52.7–54.3) | 52.7 (52.5–53.1) | 43.5 (43.5–43.8) | 44.5 (44.2–44.8) |
| 5. 100 SELECTs on a string comparison           |    191 (189–195) |    190 (190–194) |    173 (172–174) |    177 (177–179) |
| 6. Creating an index                            | 8.89 (8.64–10.4) | 9.82 (9.64–10.2) | 8.79 (8.63–9.86) | 8.56 (8.42–9.09) |
| 7. 5000 SELECTs with an index                   | 8.11 (7.93–10.5) | 7.95 (7.85–9.58) | 7.66 (7.64–7.96) | 8.24 (8.15–20.4) |
| 8. 1000 UPDATEs without an index                | 13.4 (13.1–13.5) | 13.1 (13.1–13.4) | 12.2 (11.9–12.5) | 13.2 (12.8–13.8) |
| 9. 25000 UPDATEs with an index                  | 48.3 (47.3–51.6) | 52.3 (52.0–54.1) | 48.5 (48.1–49.7) | 48.7 (47.6–49.8) |
| 10. 25000 text UPDATEs with an index            | 32.3 (31.1–34.8) | 35.9 (35.6–37.6) | 32.8 (32.4–34.5) | 32.9 (32.7–34.0) |
| 11. INSERTs from a SELECT                       | 25.9 (25.8–27.4) | 31.5 (31.2–39.8) | 24.8 (24.1–26.0) | 24.4 (24.0–24.9) |
| 12. DELETE without an index                     | 16.4 (15.5–93.5) | 27.2 (26.9–28.3) | 15.5 (14.6–16.1) | 15.1 (14.8–15.4) |
| 13. DELETE with an index                        | 22.6 (22.4–26.7) | 35.6 (35.1–36.2) | 21.9 (21.5–22.1) | 21.6 (21.6–21.7) |
| 14. A big INSERT after a big DELETE             | 20.9 (20.5–21.0) | 24.5 (24.1–26.4) | 19.9 (19.3–20.0) | 19.7 (19.5–20.2) |
| 15. A big DELETE followed by many small INSERTs | 9.39 (9.16–10.4) | 14.8 (14.6–15.4) | 9.84 (9.47–10.6) | 8.98 (8.85–9.24) |
| 16. DROP TABLE                                  | 3.59 (2.72–3.70) | 29.3 (29.0–30.3) | 3.74 (3.51–4.07) | 3.60 (3.31–4.55) |
| Total                                           | 1277 (1248–1578) | 1394 (1350–1597) | 1236 (1179–1385) | 1217 (1188–1481) |
| Total without 1                                 |    505 (498–582) |    583 (578–597) |    475 (468–485) |    477 (472–485) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.39 (0.34–0.44) | 0.41 (0.39–0.75) | 0.50 (0.46–0.53) | 0.30 (0.27–0.31) |
| 10000 point selects      | 0.40 (0.38–0.67) | 0.43 (0.39–0.52) | 0.40 (0.36–0.45) | 0.46 (0.45–0.53) |
| 10 reads of 10000 rows   | 0.95 (0.86–2.66) | 1.02 (0.90–1.22) | 1.19 (1.06–1.52) | 1.85 (1.61–2.43) |

### Evolu relative to better-sqlite3

The median over rounds of Evolu's time divided by better-sqlite3's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / better-sqlite3 |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ---------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |       1.05 (0.92–1.20) |        |         1.04 (1.00–1.09) |
| 2. 25000 INSERTs in a transaction               |       0.91 (0.86–1.26) |        |         1.16 (0.91–1.35) |
| 3. 25000 INSERTs into an indexed table          |       0.97 (0.92–1.09) |        |         1.11 (1.07–1.13) |
| 4. 100 SELECTs without an index                 |       1.21 (1.21–1.25) | slower |         0.99 (0.98–1.00) |
| 5. 100 SELECTs on a string comparison           |       1.11 (1.10–1.13) | slower |         1.00 (0.97–1.02) |
| 6. Creating an index                            |       1.02 (0.98–1.09) |        |         1.09 (0.98–1.14) |
| 7. 5000 SELECTs with an index                   |       1.06 (1.03–1.32) |        |         0.98 (0.91–1.02) |
| 8. 1000 UPDATEs without an index                |       1.10 (1.07–1.11) | slower |         1.00 (0.98–1.00) |
| 9. 25000 UPDATEs with an index                  |       1.00 (0.98–1.04) |        |         1.09 (1.05–1.10) |
| 10. 25000 text UPDATEs with an index            |       0.99 (0.95–1.01) |        |         1.11 (1.08–1.15) |
| 11. INSERTs from a SELECT                       |       1.06 (1.00–1.08) |        |         1.22 (1.14–1.49) |
| 12. DELETE without an index                     |       1.09 (0.96–6.03) |        |         1.67 (0.30–1.75) |
| 13. DELETE with an index                        |       1.05 (1.02–1.21) |        |         1.58 (1.36–1.59) |
| 14. A big INSERT after a big DELETE             |       1.06 (1.03–1.08) |        |         1.20 (1.15–1.26) |
| 15. A big DELETE followed by many small INSERTs |       0.99 (0.93–1.00) |        |         1.57 (1.48–1.59) |
| 16. DROP TABLE                                  |       0.95 (0.73–1.05) |        |        8.33 (7.83–11.12) |
| Total                                           |       1.07 (0.97–1.15) |        |         1.09 (1.01–1.12) |
| Total without 1                                 |       1.07 (1.05–1.23) |        |         1.15 (1.03–1.16) |
| 10000 single-row inserts                        |       0.83 (0.66–0.86) | faster |         1.07 (0.99–1.72) |
| 10000 point selects                             |       1.03 (0.95–1.49) |        |         1.05 (0.77–1.19) |
| 10 reads of 10000 rows                          |       0.80 (0.65–1.75) |        |         0.96 (0.46–1.19) |

**Verdict:** Evolu is slower than better-sqlite3 in 4. 100 SELECTs without an index; 5. 100 SELECTs on a string comparison; 8. 1000 UPDATEs without an index.

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

| Option                     | Evolu        | Evolu, encrypted | better-sqlite3 | node:sqlite |
| -------------------------- | ------------ | ---------------- | -------------- | ----------- |
| COMPILER                   | clang-22.1.3 | clang-22.1.3     | gcc-15.2.0     | gcc-15.2.0  |
| DEFAULT_CACHE_SIZE         | -2000        | -2000            | -16000         | -2000       |
| DEFAULT_FOREIGN_KEYS       |              |                  | set            |             |
| DEFAULT_WAL_SYNCHRONOUS    | 2            | 2                | 1              | 2           |
| DQS                        | 0            | 0                | 0              |             |
| ENABLE_COLUMN_METADATA     |              |                  | set            | set         |
| ENABLE_DBSTAT_VTAB         |              |                  | set            | set         |
| ENABLE_FTS3                |              |                  | set            | set         |
| ENABLE_FTS3_PARENTHESIS    |              |                  | set            | set         |
| ENABLE_FTS4                |              |                  | set            |             |
| ENABLE_FTS5                |              |                  | set            | set         |
| ENABLE_GEOPOLY             |              |                  | set            | set         |
| ENABLE_LOCKING_STYLE       | 0            | 0                |                |             |
| ENABLE_PERCENTILE          |              |                  | set            | set         |
| ENABLE_PREUPDATE_HOOK      |              |                  |                | set         |
| ENABLE_RBU                 |              |                  |                | set         |
| ENABLE_RTREE               |              |                  | set            | set         |
| ENABLE_SESSION             |              |                  |                | set         |
| ENABLE_STAT4               |              |                  | set            |             |
| ENABLE_UPDATE_DELETE_LIMIT |              |                  | set            |             |
| LIKE_DOESNT_MATCH_BLOBS    |              |                  | set            |             |
| MAX_SCHEMA                 | 10000000     | 10000000         |                |             |
| MAX_WORKER_THREADS         | 0            | 0                | 8              | 8           |
| OMIT_DEPRECATED            |              |                  | set            |             |
| OMIT_INCRBLOB              | set          | set              |                |             |
| OMIT_INTROSPECTION_PRAGMAS | set          | set              |                |             |
| OMIT_LOAD_EXTENSION        | set          | set              |                |             |
| OMIT_PROGRESS_CALLBACK     | set          | set              | set            |             |
| OMIT_SHARED_CACHE          |              |                  | set            |             |
| OMIT_TCL_VARIABLE          |              |                  | set            |             |
| SOUNDEX                    |              |                  | set            |             |
| TEMP_STORE                 | 3            | 3                | 1              | 1           |
| THREADSAFE                 | 2            | 2                | 2              | 1           |
| USE_URI                    |              |                  | set            |             |
