# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

## Node.js 24.22.0, node:24.22.0-alpine (musl) on arm64

Run 2026-10-27T10:34:50.006Z. CPU unknown, 4 cores, 6 GiB; OS Linux 6.8.0-100-generic arm64; Node.js 24.22.0; C library musl; Checkout 0a9a95ebc with uncommitted changes; Host Apple M5, 10 cores, 16 GiB; macOS 26.6.2 arm64; Container node:24.22.0-alpine (musl).

Load averages: 0.01, 0.10, 0.07 before, 0.65, 0.26, 0.12 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |    720 (702–765) |    818 (773–938) |    736 (715–830) |    736 (666–763) |
| 2. 25000 INSERTs in a transaction               | 20.8 (17.5–23.5) | 22.0 (18.9–23.3) | 20.7 (17.6–21.8) | 18.1 (17.5–19.4) |
| 3. 25000 INSERTs into an indexed table          | 35.5 (32.0–36.9) | 37.3 (35.9–39.7) | 34.7 (32.3–35.0) | 33.1 (31.6–33.5) |
| 4. 100 SELECTs without an index                 | 53.1 (53.0–53.4) | 52.9 (52.5–53.8) | 43.5 (43.4–43.9) | 44.7 (44.6–45.1) |
| 5. 100 SELECTs on a string comparison           |    189 (189–190) |    190 (189–196) |    172 (172–173) |    177 (176–178) |
| 6. Creating an index                            | 8.88 (8.84–9.39) | 9.73 (9.36–11.3) | 8.75 (8.29–9.08) | 8.62 (8.22–9.12) |
| 7. 5000 SELECTs with an index                   | 8.89 (8.42–9.64) | 8.84 (8.01–9.09) | 7.85 (7.60–8.04) | 7.89 (7.77–23.1) |
| 8. 1000 UPDATEs without an index                | 13.4 (13.2–14.5) | 13.5 (13.4–13.6) | 12.0 (11.8–15.7) | 13.6 (13.3–16.0) |
| 9. 25000 UPDATEs with an index                  | 51.0 (49.1–52.7) | 53.9 (51.9–58.9) | 49.2 (48.1–50.2) | 49.2 (48.3–50.9) |
| 10. 25000 text UPDATEs with an index            | 34.7 (31.8–35.7) | 36.6 (36.0–42.3) | 34.1 (32.2–35.0) | 33.5 (32.8–34.0) |
| 11. INSERTs from a SELECT                       | 26.0 (25.6–29.5) | 32.2 (30.9–35.8) | 25.9 (24.0–26.6) | 25.5 (25.1–25.9) |
| 12. DELETE without an index                     | 16.3 (16.0–17.4) | 28.0 (26.3–30.8) | 15.8 (15.2–16.1) | 15.6 (15.4–16.1) |
| 13. DELETE with an index                        | 22.4 (21.9–23.4) | 35.5 (34.9–37.6) | 21.5 (21.4–21.9) | 21.4 (21.1–21.7) |
| 14. A big INSERT after a big DELETE             | 20.9 (20.6–23.8) | 24.5 (24.1–25.1) | 19.7 (19.6–20.0) | 19.6 (19.2–20.8) |
| 15. A big DELETE followed by many small INSERTs | 10.4 (9.37–15.4) | 15.2 (14.4–16.3) | 9.90 (9.19–10.6) | 9.47 (9.18–9.91) |
| 16. DROP TABLE                                  | 3.35 (3.25–7.81) | 29.6 (29.2–31.3) | 3.66 (3.38–4.13) | 3.47 (3.10–3.97) |
| Total                                           | 1239 (1219–1285) | 1415 (1363–1541) | 1209 (1193–1312) | 1235 (1153–1244) |
| Total without 1                                 |    517 (508–529) |    594 (586–603) |    479 (471–483) |    486 (479–499) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.45 (0.42–0.52) | 0.47 (0.39–0.77) | 0.57 (0.50–0.63) | 0.32 (0.29–0.45) |
| 10000 point selects      | 0.54 (0.42–0.97) | 0.52 (0.39–0.56) | 0.42 (0.37–0.45) | 0.61 (0.49–0.75) |
| 10 reads of 10000 rows   | 1.66 (0.90–1.88) | 1.18 (1.00–2.16) | 1.28 (1.09–1.42) | 2.56 (2.07–2.82) |

### Evolu relative to better-sqlite3

The median over rounds of Evolu's time divided by better-sqlite3's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / better-sqlite3 |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ---------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |       0.95 (0.87–1.07) |        |         1.13 (1.07–1.24) |
| 2. 25000 INSERTs in a transaction               |       1.08 (0.83–1.18) |        |         1.01 (0.90–1.19) |
| 3. 25000 INSERTs into an indexed table          |       1.01 (0.92–1.14) |        |         1.07 (0.97–1.24) |
| 4. 100 SELECTs without an index                 |       1.22 (1.21–1.23) | slower |         1.00 (0.98–1.01) |
| 5. 100 SELECTs on a string comparison           |       1.10 (1.10–1.10) |        |         1.01 (1.00–1.03) |
| 6. Creating an index                            |       1.03 (0.99–1.07) |        |         1.10 (1.05–1.20) |
| 7. 5000 SELECTs with an index                   |       1.16 (1.07–1.23) | slower |         0.92 (0.88–1.06) |
| 8. 1000 UPDATEs without an index                |       1.11 (0.92–1.12) |        |         1.01 (0.94–1.02) |
| 9. 25000 UPDATEs with an index                  |       1.02 (1.00–1.10) |        |         1.06 (0.98–1.20) |
| 10. 25000 text UPDATEs with an index            |       1.03 (0.92–1.08) |        |         1.05 (1.03–1.33) |
| 11. INSERTs from a SELECT                       |       1.01 (0.98–1.21) |        |         1.26 (1.09–1.38) |
| 12. DELETE without an index                     |       1.01 (1.00–1.14) |        |         1.71 (1.56–1.93) |
| 13. DELETE with an index                        |       1.04 (1.02–1.07) |        |         1.57 (1.51–1.71) |
| 14. A big INSERT after a big DELETE             |       1.05 (1.05–1.19) |        |         1.17 (1.04–1.20) |
| 15. A big DELETE followed by many small INSERTs |       1.09 (0.91–1.61) |        |         1.52 (0.96–1.62) |
| 16. DROP TABLE                                  |       0.97 (0.82–1.89) |        |         9.06 (3.79–9.64) |
| Total                                           |       1.01 (0.94–1.08) |        |         1.15 (1.09–1.21) |
| Total without 1                                 |       1.09 (1.05–1.10) |        |         1.14 (1.12–1.18) |
| 10000 single-row inserts                        |       0.78 (0.68–1.04) |        |         0.93 (0.85–1.71) |
| 10000 point selects                             |       1.30 (0.94–2.47) |        |         0.92 (0.45–1.32) |
| 10 reads of 10000 rows                          |       1.32 (0.70–1.50) |        |         0.74 (0.58–2.41) |

**Verdict:** Evolu is slower than better-sqlite3 in 4. 100 SELECTs without an index; 7. 5000 SELECTs with an index.

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
