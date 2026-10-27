# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

## Node.js 24.22.0, node:24.22.0-trixie-slim (Debian 13, glibc) on arm64

Run 2026-10-27T10:58:55.203Z. CPU unknown, 4 cores, 6 GiB; OS Linux 6.8.0-100-generic arm64; Node.js 24.22.0; C library glibc 2.41; Checkout 0a9a95ebc with uncommitted changes; Host Apple M5, 10 cores, 16 GiB; macOS 26.6.2 arm64; Container node:24.22.0-trixie-slim (Debian 13, glibc).

Load averages: 0.02, 0.04, 0.01 before, 0.59, 0.18, 0.06 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |    709 (665–757) |    754 (719–807) |    711 (682–741) |    693 (663–781) |
| 2. 25000 INSERTs in a transaction               | 15.4 (15.3–16.2) | 17.8 (17.2–21.5) | 16.9 (16.8–17.2) | 14.6 (14.3–15.1) |
| 3. 25000 INSERTs into an indexed table          | 25.9 (25.3–26.4) | 29.4 (29.0–31.0) | 26.5 (26.2–26.9) | 24.5 (24.1–25.4) |
| 4. 100 SELECTs without an index                 | 51.0 (50.5–51.1) | 51.0 (50.3–51.3) | 40.6 (40.4–41.5) | 40.4 (40.3–40.5) |
| 5. 100 SELECTs on a string comparison           |    175 (174–175) |    176 (174–177) |    162 (161–166) |    157 (156–158) |
| 6. Creating an index                            | 8.08 (7.72–8.23) | 8.82 (8.67–9.15) | 8.24 (7.98–8.89) | 8.04 (7.84–8.12) |
| 7. 5000 SELECTs with an index                   | 7.14 (7.02–7.20) | 7.07 (6.96–7.30) | 7.23 (7.08–8.13) | 6.82 (6.73–6.96) |
| 8. 1000 UPDATEs without an index                | 12.2 (12.0–12.9) | 12.4 (12.3–12.7) | 10.9 (10.6–11.2) | 10.7 (10.5–10.9) |
| 9. 25000 UPDATEs with an index                  | 38.7 (38.3–39.0) | 43.1 (42.8–43.7) | 38.4 (38.3–39.8) | 36.7 (36.4–37.5) |
| 10. 25000 text UPDATEs with an index            | 27.2 (26.9–28.0) | 31.0 (30.5–31.5) | 28.5 (27.9–28.9) | 27.1 (26.9–27.4) |
| 11. INSERTs from a SELECT                       | 17.5 (17.2–18.3) | 23.2 (23.2–23.6) | 16.2 (15.8–16.5) | 16.0 (15.8–16.7) |
| 12. DELETE without an index                     | 11.5 (11.3–12.1) | 22.4 (22.0–22.6) | 11.3 (10.8–12.3) | 11.0 (10.9–11.3) |
| 13. DELETE with an index                        | 14.5 (14.3–14.7) | 26.2 (25.9–26.6) | 14.0 (13.9–14.1) | 13.8 (13.6–14.1) |
| 14. A big INSERT after a big DELETE             | 14.1 (14.0–14.3) | 17.9 (17.5–18.0) | 12.9 (12.6–13.0) | 13.0 (12.9–13.3) |
| 15. A big DELETE followed by many small INSERTs | 7.97 (7.93–8.33) | 13.0 (12.8–13.4) | 8.67 (8.51–8.80) | 7.58 (7.56–7.79) |
| 16. DROP TABLE                                  | 3.00 (2.80–3.59) | 26.6 (25.8–27.2) | 3.41 (3.30–3.55) | 3.39 (3.09–3.67) |
| Total                                           | 1138 (1095–1189) | 1256 (1228–1310) | 1117 (1087–1146) | 1083 (1056–1173) |
| Total without 1                                 |    430 (428–432) |    508 (502–509) |    406 (404–416) |    392 (389–393) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.32 (0.32–0.35) | 0.35 (0.32–0.38) | 0.43 (0.42–0.45) | 0.29 (0.26–0.29) |
| 10000 point selects      | 0.38 (0.37–0.39) | 0.38 (0.35–0.39) | 0.37 (0.35–0.37) | 0.40 (0.39–0.41) |
| 10 reads of 10000 rows   | 0.82 (0.76–0.89) | 0.90 (0.82–0.91) | 1.04 (0.96–1.15) | 1.50 (1.41–1.88) |

### Evolu relative to better-sqlite3

The median over rounds of Evolu's time divided by better-sqlite3's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / better-sqlite3 |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ---------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |       1.02 (0.94–1.04) |        |         1.07 (1.05–1.12) |
| 2. 25000 INSERTs in a transaction               |       0.91 (0.89–0.96) |        |         1.13 (1.10–1.41) |
| 3. 25000 INSERTs into an indexed table          |       0.97 (0.97–1.01) |        |         1.14 (1.11–1.18) |
| 4. 100 SELECTs without an index                 |       1.25 (1.23–1.27) | slower |         1.00 (0.98–1.01) |
| 5. 100 SELECTs on a string comparison           |       1.08 (1.05–1.08) |        |         1.00 (1.00–1.01) |
| 6. Creating an index                            |       0.97 (0.88–1.00) |        |         1.13 (1.06–1.17) |
| 7. 5000 SELECTs with an index                   |       0.99 (0.88–1.01) |        |         0.99 (0.97–1.02) |
| 8. 1000 UPDATEs without an index                |       1.14 (1.07–1.19) | slower |         1.01 (0.95–1.06) |
| 9. 25000 UPDATEs with an index                  |       1.00 (0.97–1.02) |        |         1.12 (1.10–1.14) |
| 10. 25000 text UPDATEs with an index            |       0.96 (0.93–0.97) |        |         1.13 (1.11–1.17) |
| 11. INSERTs from a SELECT                       |       1.09 (1.06–1.12) |        |         1.32 (1.27–1.35) |
| 12. DELETE without an index                     |       1.06 (0.93–1.08) |        |         1.95 (1.81–1.99) |
| 13. DELETE with an index                        |       1.04 (1.01–1.06) |        |         1.81 (1.79–1.83) |
| 14. A big INSERT after a big DELETE             |       1.10 (1.08–1.13) |        |         1.27 (1.23–1.28) |
| 15. A big DELETE followed by many small INSERTs |       0.93 (0.91–0.96) |        |         1.61 (1.57–1.69) |
| 16. DROP TABLE                                  |       0.85 (0.82–1.02) |        |         8.88 (7.19–9.70) |
| Total                                           |       1.04 (0.98–1.05) |        |         1.10 (1.10–1.14) |
| Total without 1                                 |       1.06 (1.04–1.07) |        |         1.18 (1.16–1.19) |
| 10000 single-row inserts                        |       0.76 (0.72–0.79) | faster |         1.05 (1.01–1.20) |
| 10000 point selects                             |       1.04 (1.03–1.06) |        |         0.97 (0.94–1.02) |
| 10 reads of 10000 rows                          |       0.79 (0.66–0.85) | faster |         1.01 (0.93–1.20) |

**Verdict:** Evolu is slower than better-sqlite3 in 4. 100 SELECTs without an index; 8. 1000 UPDATEs without an index.

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
