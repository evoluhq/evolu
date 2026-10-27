# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

## Node.js 24.22.0, macOS 26.6.2 arm64

Run 2026-10-27T10:04:42.585Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes.

Load averages: 1.42, 2.57, 3.60 before, 1.50, 2.51, 3.56 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |    198 (188–297) |    235 (222–278) |    197 (178–236) |    195 (186–242) |
| 2. 25000 INSERTs in a transaction               | 14.5 (14.3–14.8) | 16.6 (16.1–19.5) | 16.5 (16.4–18.7) | 15.4 (15.0–15.7) |
| 3. 25000 INSERTs into an indexed table          | 27.5 (27.2–29.2) | 30.8 (30.5–42.6) | 30.2 (29.0–36.6) | 29.0 (28.5–29.3) |
| 4. 100 SELECTs without an index                 | 44.0 (43.7–44.3) | 43.7 (43.6–59.5) | 44.0 (43.3–44.3) | 50.7 (50.6–51.1) |
| 5. 100 SELECTs on a string comparison           |    180 (177–180) |    180 (178–190) |    178 (177–179) |    184 (183–185) |
| 6. Creating an index                            | 6.24 (6.23–7.86) | 6.94 (6.78–8.26) | 6.28 (6.09–7.77) | 6.22 (6.14–6.39) |
| 7. 5000 SELECTs with an index                   | 6.90 (6.74–6.97) | 7.06 (6.83–7.52) | 6.98 (6.89–7.14) | 7.00 (6.86–7.13) |
| 8. 1000 UPDATEs without an index                | 10.8 (10.7–10.9) | 10.7 (10.6–11.7) | 11.1 (11.0–11.2) | 11.4 (11.3–11.4) |
| 9. 25000 UPDATEs with an index                  | 38.7 (38.5–40.6) | 44.0 (43.3–52.0) | 41.0 (40.4–41.6) | 40.2 (40.0–40.6) |
| 10. 25000 text UPDATEs with an index            | 28.3 (27.5–29.0) | 32.1 (31.8–34.3) | 29.7 (29.4–31.1) | 29.4 (29.0–31.9) |
| 11. INSERTs from a SELECT                       | 20.9 (19.0–23.9) | 26.4 (24.9–36.1) | 19.3 (18.8–31.6) | 18.9 (18.8–21.8) |
| 12. DELETE without an index                     | 16.3 (13.9–18.2) | 24.5 (24.2–28.2) | 13.8 (13.8–20.9) | 15.0 (13.5–30.7) |
| 13. DELETE with an index                        | 15.4 (15.2–15.7) | 29.0 (28.2–69.0) | 14.9 (14.7–15.4) | 15.2 (15.1–15.4) |
| 14. A big INSERT after a big DELETE             | 14.4 (14.1–17.2) | 17.9 (17.7–18.0) | 13.8 (13.5–13.9) | 13.9 (13.7–14.2) |
| 15. A big DELETE followed by many small INSERTs | 7.89 (7.69–9.01) | 12.6 (12.4–13.1) | 8.73 (8.70–8.97) | 8.17 (8.05–8.92) |
| 16. DROP TABLE                                  | 1.24 (1.16–1.45) | 30.2 (27.8–31.9) | 1.32 (1.28–1.41) | 1.36 (1.20–1.57) |
| Total                                           |    628 (621–735) |    778 (736–838) |    637 (613–689) |    646 (633–689) |
| Total without 1                                 |    432 (431–441) |    515 (509–578) |    440 (432–455) |    448 (444–463) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |   better-sqlite3 |      node:sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.31 (0.29–0.34) | 0.32 (0.30–0.33) | 0.43 (0.42–0.44) | 0.29 (0.27–0.29) |
| 10000 point selects      | 0.34 (0.33–0.36) | 0.35 (0.32–0.35) | 0.34 (0.33–0.35) | 0.40 (0.40–0.41) |
| 10 reads of 10000 rows   | 0.89 (0.77–0.98) | 0.86 (0.79–0.90) | 0.98 (0.96–0.99) | 1.78 (1.59–2.07) |

### Evolu relative to better-sqlite3

The median over rounds of Evolu's time divided by better-sqlite3's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / better-sqlite3 |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ---------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |       1.03 (0.96–1.26) |        |         1.16 (0.89–1.48) |
| 2. 25000 INSERTs in a transaction               |       0.88 (0.76–0.90) | faster |         1.13 (1.12–1.37) |
| 3. 25000 INSERTs into an indexed table          |       0.92 (0.79–0.97) |        |         1.13 (1.05–1.56) |
| 4. 100 SELECTs without an index                 |       1.00 (0.99–1.02) |        |         0.99 (0.99–1.35) |
| 5. 100 SELECTs on a string comparison           |       1.01 (0.99–1.01) |        |         1.00 (0.99–1.07) |
| 6. Creating an index                            |       1.01 (0.98–1.03) |        |         1.11 (0.88–1.30) |
| 7. 5000 SELECTs with an index                   |       0.98 (0.97–1.01) |        |         1.02 (0.99–1.12) |
| 8. 1000 UPDATEs without an index                |       0.97 (0.97–0.99) |        |         0.99 (0.98–1.07) |
| 9. 25000 UPDATEs with an index                  |       0.94 (0.94–0.98) |        |         1.14 (1.07–1.35) |
| 10. 25000 text UPDATEs with an index            |       0.94 (0.91–0.98) |        |         1.14 (1.10–1.25) |
| 11. INSERTs from a SELECT                       |       1.03 (0.71–1.24) |        |         1.31 (1.10–1.83) |
| 12. DELETE without an index                     |       1.15 (0.87–1.18) |        |         1.49 (1.35–2.02) |
| 13. DELETE with an index                        |       1.05 (1.00–1.06) |        |         1.85 (1.80–4.49) |
| 14. A big INSERT after a big DELETE             |       1.05 (1.01–1.26) |        |         1.23 (1.04–1.27) |
| 15. A big DELETE followed by many small INSERTs |       0.91 (0.88–1.00) |        |         1.63 (1.40–1.65) |
| 16. DROP TABLE                                  |       0.89 (0.87–1.12) |        |      25.01 (19.48–27.59) |
| Total                                           |       1.01 (0.97–1.08) |        |         1.18 (1.06–1.35) |
| Total without 1                                 |       0.98 (0.97–1.00) |        |         1.19 (1.15–1.34) |
| 10000 single-row inserts                        |       0.72 (0.66–0.78) | faster |         1.05 (0.97–1.10) |
| 10000 point selects                             |       1.01 (0.97–1.03) |        |         1.03 (0.94–1.04) |
| 10 reads of 10000 rows                          |       0.91 (0.79–0.98) |        |         0.92 (0.88–1.17) |

**Verdict:** Evolu is not slower than better-sqlite3 in any metric.

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

| Option                     | Evolu        | Evolu, encrypted | better-sqlite3 | node:sqlite  |
| -------------------------- | ------------ | ---------------- | -------------- | ------------ |
| COMPILER                   | clang-17.0.0 | clang-17.0.0     | clang-17.0.0   | clang-16.0.0 |
| DEFAULT_CACHE_SIZE         | -2000        | -2000            | -16000         | -2000        |
| DEFAULT_FOREIGN_KEYS       |              |                  | set            |              |
| DEFAULT_WAL_SYNCHRONOUS    | 2            | 2                | 1              | 2            |
| DQS                        | 0            | 0                | 0              |              |
| ENABLE_COLUMN_METADATA     |              |                  | set            | set          |
| ENABLE_DBSTAT_VTAB         |              |                  | set            | set          |
| ENABLE_FTS3                |              |                  | set            | set          |
| ENABLE_FTS3_PARENTHESIS    |              |                  | set            | set          |
| ENABLE_FTS4                |              |                  | set            |              |
| ENABLE_FTS5                |              |                  | set            | set          |
| ENABLE_GEOPOLY             |              |                  | set            | set          |
| ENABLE_LOCKING_STYLE       | 0            | 0                |                |              |
| ENABLE_PERCENTILE          |              |                  | set            | set          |
| ENABLE_PREUPDATE_HOOK      |              |                  |                | set          |
| ENABLE_RBU                 |              |                  |                | set          |
| ENABLE_RTREE               |              |                  | set            | set          |
| ENABLE_SESSION             |              |                  |                | set          |
| ENABLE_STAT4               |              |                  | set            |              |
| ENABLE_UPDATE_DELETE_LIMIT |              |                  | set            |              |
| LIKE_DOESNT_MATCH_BLOBS    |              |                  | set            |              |
| MAX_SCHEMA                 | 10000000     | 10000000         |                |              |
| MAX_WORKER_THREADS         | 0            | 0                | 8              | 8            |
| OMIT_DEPRECATED            |              |                  | set            |              |
| OMIT_INCRBLOB              | set          | set              |                |              |
| OMIT_INTROSPECTION_PRAGMAS | set          | set              |                |              |
| OMIT_LOAD_EXTENSION        | set          | set              |                |              |
| OMIT_PROGRESS_CALLBACK     | set          | set              | set            |              |
| OMIT_SHARED_CACHE          |              |                  | set            |              |
| OMIT_TCL_VARIABLE          |              |                  | set            |              |
| SOUNDEX                    |              |                  | set            |              |
| TEMP_STORE                 | 3            | 3                | 1              | 1            |
| THREADSAFE                 | 2            | 2                | 2              | 1            |
| USE_URI                    |              |                  | set            |              |
