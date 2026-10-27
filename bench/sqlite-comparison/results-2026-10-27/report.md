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

## React Native 0.88.0, sdk_gphone16k_arm64 emulator (Pixel_10), Android 17 (API 37), arm64-v8a

Run 2026-10-27T13:10:37.069Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes; Device sdk_gphone16k_arm64 emulator (Pixel_10), Android 17 (API 37), arm64-v8a; Fingerprint google/sdk_gphone16k_arm64/emu64a16k:17/CP21.260330.005/15181570:user/dev-keys; React Native 0.88.0; Hermes 260318099.0.4.

Load averages: 2.26, 3.16, 4.26 before, 1.70, 2.84, 4.06 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |      expo-sqlite |        op-sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |    930 (929–940) |    973 (948–994) |    941 (913–985) |   952 (939–1003) |
| 2. 25000 INSERTs in a transaction               | 20.1 (20.0–20.4) | 21.7 (21.4–22.1) | 24.6 (24.2–27.1) | 21.9 (21.7–22.0) |
| 3. 25000 INSERTs into an indexed table          | 30.2 (30.0–30.3) | 33.5 (33.3–40.4) | 34.8 (34.7–36.3) | 32.5 (32.1–33.2) |
| 4. 100 SELECTs without an index                 | 47.3 (46.9–49.7) | 47.4 (47.2–51.4) | 48.4 (48.2–49.4) | 47.7 (47.6–47.9) |
| 5. 100 SELECTs on a string comparison           |    168 (167–172) |    168 (167–172) |    171 (168–172) |    169 (169–171) |
| 6. Creating an index                            | 9.81 (9.57–11.8) | 10.6 (9.74–12.7) | 9.88 (9.72–15.2) | 10.1 (9.72–12.3) |
| 7. 5000 SELECTs with an index                   | 9.38 (9.26–9.57) | 9.44 (9.25–9.66) | 8.89 (8.79–9.05) | 10.0 (9.92–10.1) |
| 8. 1000 UPDATEs without an index                | 13.2 (12.5–14.9) | 12.8 (12.8–13.1) | 13.5 (13.4–13.8) | 13.4 (13.3–13.5) |
| 9. 25000 UPDATEs with an index                  | 40.6 (40.4–41.6) | 45.0 (44.7–45.6) | 46.0 (45.4–54.5) | 44.7 (44.0–45.4) |
| 10. 25000 text UPDATEs with an index            | 30.6 (30.6–31.9) | 35.3 (34.2–36.8) | 36.4 (36.2–39.1) | 34.2 (34.0–35.6) |
| 11. INSERTs from a SELECT                       | 17.9 (17.6–18.1) | 23.6 (23.0–24.9) | 17.6 (17.0–19.5) | 17.3 (17.1–18.2) |
| 12. DELETE without an index                     | 10.7 (10.5–11.1) | 23.5 (22.0–23.7) | 11.0 (10.7–11.3) | 10.9 (10.6–11.7) |
| 13. DELETE with an index                        | 14.2 (13.8–14.2) | 25.8 (25.6–27.4) | 14.4 (14.1–15.0) | 14.1 (14.0–14.2) |
| 14. A big INSERT after a big DELETE             | 14.8 (14.4–15.3) | 18.7 (18.1–20.1) | 14.5 (14.0–14.6) | 14.1 (13.8–14.5) |
| 15. A big DELETE followed by many small INSERTs | 10.2 (10.1–10.5) | 15.0 (14.9–15.8) | 12.6 (12.4–14.9) | 11.1 (11.0–11.2) |
| 16. DROP TABLE                                  | 3.91 (2.75–6.20) | 26.5 (25.5–27.8) | 3.93 (3.51–4.04) | 3.77 (3.40–4.35) |
| Total                                           | 1377 (1369–1383) | 1502 (1467–1511) | 1411 (1376–1470) | 1411 (1395–1458) |
| Total without 1                                 |    444 (440–450) |    519 (517–529) |    466 (463–485) |    456 (455–460) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |      expo-sqlite |        op-sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.38 (0.37–0.38) | 0.38 (0.37–0.38) | 4.30 (4.10–4.56) | 0.97 (0.94–1.02) |
| 10000 point selects      | 0.62 (0.60–0.63) | 0.63 (0.61–0.65) | 5.29 (4.84–5.84) | 1.75 (1.72–1.78) |
| 10 reads of 10000 rows   | 2.15 (2.15–2.18) | 2.18 (2.13–2.21) | 10.4 (10.3–10.7) | 5.93 (5.86–5.95) |

### Evolu relative to expo-sqlite

The median over rounds of Evolu's time divided by expo-sqlite's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / expo-sqlite |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |    1.00 (0.94–1.03) |        |         1.04 (1.01–1.07) |
| 2. 25000 INSERTs in a transaction               |    0.81 (0.75–0.83) | faster |         1.07 (1.06–1.10) |
| 3. 25000 INSERTs into an indexed table          |    0.86 (0.83–0.87) | faster |         1.12 (1.10–1.33) |
| 4. 100 SELECTs without an index                 |    0.98 (0.97–1.01) |        |         1.01 (0.95–1.06) |
| 5. 100 SELECTs on a string comparison           |    1.00 (0.98–1.01) |        |         1.00 (0.98–1.03) |
| 6. Creating an index                            |    0.98 (0.65–1.20) |        |         1.07 (0.99–1.11) |
| 7. 5000 SELECTs with an index                   |    1.05 (1.03–1.08) |        |         1.02 (0.97–1.03) |
| 8. 1000 UPDATEs without an index                |    0.98 (0.93–1.09) |        |         0.97 (0.87–1.04) |
| 9. 25000 UPDATEs with an index                  |    0.88 (0.75–0.92) | faster |         1.11 (1.09–1.12) |
| 10. 25000 text UPDATEs with an index            |    0.84 (0.79–0.88) | faster |         1.15 (1.07–1.19) |
| 11. INSERTs from a SELECT                       |    1.03 (0.90–1.05) |        |         1.31 (1.28–1.39) |
| 12. DELETE without an index                     |    0.98 (0.95–0.99) |        |         2.14 (2.10–2.23) |
| 13. DELETE with an index                        |    0.98 (0.94–1.01) |        |         1.87 (1.80–1.93) |
| 14. A big INSERT after a big DELETE             |    1.03 (1.01–1.06) |        |         1.26 (1.19–1.34) |
| 15. A big DELETE followed by many small INSERTs |    0.81 (0.68–0.83) | faster |         1.47 (1.43–1.54) |
| 16. DROP TABLE                                  |    0.99 (0.68–1.58) |        |        6.78 (4.17–10.13) |
| Total                                           |    0.97 (0.93–1.00) |        |         1.09 (1.07–1.09) |
| Total without 1                                 |    0.95 (0.91–0.97) |        |         1.18 (1.15–1.19) |
| 10000 single-row inserts                        |    0.09 (0.08–0.09) | faster |         0.99 (0.98–1.02) |
| 10000 point selects                             |    0.12 (0.11–0.13) | faster |         1.03 (0.96–1.06) |
| 10 reads of 10000 rows                          |    0.21 (0.20–0.21) | faster |         1.01 (0.99–1.02) |

**Verdict:** Evolu is not slower than expo-sqlite in any metric.

### SQLite and pragmas

Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.

| Stack            | Library                              | Binding                | SQLite | Source ID                      | page_size | journal_mode | synchronous | cache_size | temp_store | secure_delete | locking_mode | auto_vacuum | mmap_size |
| ---------------- | ------------------------------------ | ---------------------- | ------ | ------------------------------ | --------- | ------------ | ----------- | ---------- | ---------- | ------------- | ------------ | ----------- | --------- |
| Evolu            | Evolu's SQLite (@evolu/react-native) | JSI, unix VFS          | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| Evolu, encrypted | Evolu's SQLite (@evolu/react-native) | JSI, Evolu's codec     | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 1 (ON)        | normal       | 0 (NONE)    | 0         |
| expo-sqlite      | expo-sqlite 58.0.14                  | Expo Modules, unix VFS | 3.53.3 | 2026-06-26 20:14:12 d4c0e51e4a | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| op-sqlite        | op-sqlite 18.2.5                     | JSI, unix VFS          | 3.53.4 | 2026-07-24 19:02:57 bf7c7f3003 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |

### Compile options that differ

An empty cell is an option the build doesn't report.

| Option                     | Evolu    | Evolu, encrypted | expo-sqlite | op-sqlite |
| -------------------------- | -------- | ---------------- | ----------- | --------- |
| DEFAULT_MEMSTATUS          | 0        | 0                |             |           |
| DQS                        | 0        | 0                |             |           |
| ENABLE_API_ARMOR           |          |                  | set         |           |
| ENABLE_BYTECODE_VTAB       |          |                  | set         |           |
| ENABLE_FTS3                |          |                  | set         |           |
| ENABLE_FTS3_PARENTHESIS    |          |                  | set         |           |
| ENABLE_FTS4                |          |                  | set         |           |
| ENABLE_FTS5                |          |                  | set         |           |
| ENABLE_LOCKING_STYLE       | 0        | 0                |             |           |
| ENABLE_MATH_FUNCTIONS      | set      | set              | set         |           |
| ENABLE_PREUPDATE_HOOK      |          |                  | set         |           |
| ENABLE_SESSION             |          |                  | set         |           |
| MAX_SCHEMA                 | 10000000 | 10000000         |             |           |
| MAX_WORKER_THREADS         | 0        | 0                | 8           | 8         |
| OMIT_INCRBLOB              | set      | set              |             |           |
| OMIT_INTROSPECTION_PRAGMAS | set      | set              |             |           |
| OMIT_LOAD_EXTENSION        | set      | set              |             |           |
| OMIT_PROGRESS_CALLBACK     | set      | set              |             |           |
| TEMP_STORE                 | 3        | 3                | 2           | 1         |
| THREADSAFE                 | 2        | 2                | 1           | 1         |

## React Native 0.88.0, iPhone 17 simulator, iOS 27.0

Run 2026-10-27T12:59:43.378Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes; Device iPhone 17 simulator, iOS 27.0; Xcode Xcode 27.1, Build version 27A9275; React Native 0.88.0; Hermes 260318099.0.4.

Load averages: 2.06, 5.12, 5.40 before, 2.16, 4.73, 5.24 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted |      expo-sqlite |        op-sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| 1. 1000 INSERTs                                 |    303 (293–306) |    338 (311–346) |    318 (279–374) |    304 (289–339) |
| 2. 25000 INSERTs in a transaction               | 18.4 (17.9–18.4) | 20.0 (19.8–21.8) | 19.6 (19.0–19.7) | 21.1 (20.7–22.1) |
| 3. 25000 INSERTs into an indexed table          | 32.2 (31.9–35.1) | 39.9 (35.7–95.1) | 33.7 (33.0–34.6) | 37.2 (34.6–93.6) |
| 4. 100 SELECTs without an index                 | 48.5 (48.2–49.6) | 48.7 (48.1–48.9) | 54.5 (54.0–56.4) | 50.9 (50.0–51.3) |
| 5. 100 SELECTs on a string comparison           |    179 (179–182) |    180 (178–182) |    192 (191–195) |    181 (181–183) |
| 6. Creating an index                            | 6.62 (6.45–25.4) | 7.45 (7.16–8.69) | 7.55 (7.32–8.93) | 7.49 (7.26–7.69) |
| 7. 5000 SELECTs with an index                   | 9.09 (8.75–9.48) | 9.00 (8.91–9.91) | 7.56 (7.49–7.63) | 9.17 (9.03–9.46) |
| 8. 1000 UPDATEs without an index                | 11.5 (11.3–11.7) | 11.6 (11.5–11.8) | 12.3 (12.3–12.8) | 11.3 (11.3–11.5) |
| 9. 25000 UPDATEs with an index                  | 44.3 (43.6–45.0) | 48.9 (48.4–58.2) | 46.8 (46.7–66.9) | 48.3 (47.9–55.3) |
| 10. 25000 text UPDATEs with an index            | 33.3 (32.8–38.8) | 38.2 (37.0–39.2) | 35.1 (34.7–35.6) | 36.5 (36.0–38.2) |
| 11. INSERTs from a SELECT                       | 24.4 (23.9–26.1) | 30.9 (30.5–38.5) | 25.1 (24.5–25.6) | 25.6 (23.6–29.6) |
| 12. DELETE without an index                     | 20.9 (20.7–21.9) | 34.7 (32.0–61.9) | 21.4 (21.0–25.3) | 21.6 (20.4–27.7) |
| 13. DELETE with an index                        | 17.1 (17.0–17.5) | 35.9 (35.3–37.6) | 17.7 (17.2–17.8) | 17.5 (16.9–19.0) |
| 14. A big INSERT after a big DELETE             | 17.6 (17.4–18.1) | 21.3 (21.2–22.3) | 18.1 (17.7–18.2) | 17.7 (16.9–18.5) |
| 15. A big DELETE followed by many small INSERTs | 10.6 (10.3–10.8) | 16.9 (16.3–18.0) | 10.9 (10.8–11.2) | 12.1 (11.6–12.5) |
| 16. DROP TABLE                                  | 1.55 (1.44–1.74) | 40.4 (39.1–46.2) | 1.58 (1.51–1.65) | 1.57 (1.52–1.70) |
| Total                                           |    780 (768–806) |    957 (889–999) |    829 (801–875) |    811 (780–907) |
| Total without 1                                 |    476 (472–502) |    616 (577–661) |    510 (501–521) |    507 (490–568) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted |      expo-sqlite |        op-sqlite |
| ------------------------ | ---------------: | ---------------: | ---------------: | ---------------: |
| 10000 single-row inserts | 0.36 (0.36–0.37) | 0.36 (0.36–0.38) | 3.38 (3.37–3.65) | 0.94 (0.88–0.97) |
| 10000 point selects      | 0.61 (0.59–0.63) | 0.62 (0.57–0.63) | 3.67 (3.65–3.68) | 1.51 (1.47–1.56) |
| 10 reads of 10000 rows   | 2.79 (2.66–2.88) | 2.83 (2.80–2.89) | 6.96 (6.93–6.98) | 4.89 (4.83–5.22) |

### Evolu relative to expo-sqlite

The median over rounds of Evolu's time divided by expo-sqlite's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / expo-sqlite |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |    0.92 (0.82–1.08) |        |         1.12 (1.05–1.15) |
| 2. 25000 INSERTs in a transaction               |    0.94 (0.92–0.97) |        |         1.10 (1.08–1.18) |
| 3. 25000 INSERTs into an indexed table          |    0.97 (0.92–1.03) |        |         1.15 (1.12–2.97) |
| 4. 100 SELECTs without an index                 |    0.88 (0.86–0.91) | faster |         1.00 (0.98–1.01) |
| 5. 100 SELECTs on a string comparison           |    0.93 (0.92–0.95) |        |         1.00 (0.98–1.02) |
| 6. Creating an index                            |    0.89 (0.85–2.84) |        |         1.11 (0.34–1.13) |
| 7. 5000 SELECTs with an index                   |    1.20 (1.15–1.26) | slower |         1.02 (0.94–1.09) |
| 8. 1000 UPDATEs without an index                |    0.92 (0.92–0.94) |        |         1.02 (0.99–1.04) |
| 9. 25000 UPDATEs with an index                  |    0.93 (0.67–0.95) |        |         1.12 (1.08–1.29) |
| 10. 25000 text UPDATEs with an index            |    0.94 (0.94–1.12) |        |         1.12 (1.01–1.18) |
| 11. INSERTs from a SELECT                       |    0.97 (0.95–1.05) |        |         1.28 (1.25–1.48) |
| 12. DELETE without an index                     |    0.97 (0.84–1.04) |        |         1.63 (1.53–2.99) |
| 13. DELETE with an index                        |    0.97 (0.96–1.02) |        |         2.10 (2.07–2.15) |
| 14. A big INSERT after a big DELETE             |    0.98 (0.96–1.02) |        |         1.22 (1.17–1.24) |
| 15. A big DELETE followed by many small INSERTs |    0.97 (0.95–0.98) |        |         1.63 (1.51–1.67) |
| 16. DROP TABLE                                  |    0.96 (0.91–1.13) |        |      26.14 (22.45–29.90) |
| Total                                           |    0.93 (0.89–0.99) |        |         1.21 (1.16–1.30) |
| Total without 1                                 |    0.94 (0.93–0.98) |        |         1.26 (1.22–1.39) |
| 10000 single-row inserts                        |    0.11 (0.10–0.11) | faster |         1.00 (0.98–1.04) |
| 10000 point selects                             |    0.17 (0.16–0.17) | faster |         0.99 (0.91–1.05) |
| 10 reads of 10000 rows                          |    0.40 (0.38–0.41) | faster |         1.02 (1.00–1.06) |

**Verdict:** Evolu is slower than expo-sqlite in 7. 5000 SELECTs with an index.

### SQLite and pragmas

Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.

| Stack            | Library                              | Binding                | SQLite | Source ID                      | page_size | journal_mode | synchronous | cache_size | temp_store | secure_delete | locking_mode | auto_vacuum | mmap_size |
| ---------------- | ------------------------------------ | ---------------------- | ------ | ------------------------------ | --------- | ------------ | ----------- | ---------- | ---------- | ------------- | ------------ | ----------- | --------- |
| Evolu            | Evolu's SQLite (@evolu/react-native) | JSI, unix VFS          | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| Evolu, encrypted | Evolu's SQLite (@evolu/react-native) | JSI, Evolu's codec     | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 1 (ON)        | normal       | 0 (NONE)    | 0         |
| expo-sqlite      | expo-sqlite 58.0.14                  | Expo Modules, unix VFS | 3.53.3 | 2026-06-26 20:14:12 d4c0e51e4a | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| op-sqlite        | op-sqlite 18.2.5                     | JSI, unix VFS          | 3.53.3 | 2026-07-24 19:02:57 bf7c7f3003 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |

### Compile options that differ

An empty cell is an option the build doesn't report.

| Option                     | Evolu    | Evolu, encrypted | expo-sqlite | op-sqlite |
| -------------------------- | -------- | ---------------- | ----------- | --------- |
| DEFAULT_MEMSTATUS          | 0        | 0                |             |           |
| DQS                        | 0        | 0                |             |           |
| ENABLE_API_ARMOR           |          |                  | set         |           |
| ENABLE_BYTECODE_VTAB       |          |                  | set         |           |
| ENABLE_FTS3                |          |                  | set         |           |
| ENABLE_FTS3_PARENTHESIS    |          |                  | set         |           |
| ENABLE_FTS4                |          |                  | set         |           |
| ENABLE_FTS5                |          |                  | set         |           |
| ENABLE_MATH_FUNCTIONS      | set      | set              | set         |           |
| ENABLE_PREUPDATE_HOOK      |          |                  | set         |           |
| ENABLE_SESSION             |          |                  | set         |           |
| MAX_SCHEMA                 | 10000000 | 10000000         |             |           |
| MAX_WORKER_THREADS         | 0        | 0                | 8           | 8         |
| OMIT_INCRBLOB              | set      | set              |             |           |
| OMIT_INTROSPECTION_PRAGMAS | set      | set              |             |           |
| OMIT_LOAD_EXTENSION        | set      | set              |             |           |
| OMIT_PROGRESS_CALLBACK     | set      | set              |             |           |
| TEMP_STORE                 | 3        | 3                | 2           | 1         |
| THREADSAFE                 | 2        | 2                | 1           | 1         |

## Chromium 156.0.8078.4, macOS 26.6.2 arm64

Run 2026-10-27T12:47:05.993Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes; Browser Chromium 156.0.8078.4; User agent Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36; performance.now() step 5.0 µs; Playwright 1.64.1.

Load averages: 1.93, 2.18, 1.91 before, 3.27, 2.51, 2.05 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted | @sqlite.org/sqlite-wasm |        wa-sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ----------------------: | ---------------: |
| 1. 1000 INSERTs                                 |   910 (897–1064) | 1380 (1327–1475) |         1069 (902–2381) |   993 (905–1068) |
| 2. 25000 INSERTs in a transaction               | 39.8 (38.4–48.6) | 74.2 (67.6–83.4) |        50.4 (46.6–51.1) |  75.3 (71.5–110) |
| 3. 25000 INSERTs into an indexed table          | 61.1 (54.4–67.5) |    119 (115–130) |        72.4 (68.0–73.0) |   102 (95.9–116) |
| 4. 100 SELECTs without an index                 | 61.1 (60.7–70.3) | 61.8 (61.5–67.0) |        66.2 (63.3–67.2) | 64.2 (63.6–68.0) |
| 5. 100 SELECTs on a string comparison           |    235 (222–240) |    241 (224–245) |           222 (219–230) |    269 (266–277) |
| 6. Creating an index                            | 13.6 (11.5–15.7) | 27.3 (24.8–28.5) |        13.5 (12.2–28.9) | 13.3 (11.8–13.9) |
| 7. 5000 SELECTs with an index                   | 16.9 (15.9–18.3) | 16.7 (15.6–19.8) |        17.3 (16.5–20.4) | 22.3 (21.6–24.0) |
| 8. 1000 UPDATEs without an index                | 22.0 (20.6–23.7) | 24.2 (23.8–25.5) |        22.0 (20.6–23.1) | 22.6 (22.3–23.1) |
| 9. 25000 UPDATEs with an index                  | 80.5 (76.9–90.9) |    156 (152–171) |         93.5 (85.8–102) |    129 (126–137) |
| 10. 25000 text UPDATEs with an index            | 69.6 (61.1–90.8) |    135 (130–164) |        79.9 (72.1–86.5) |    108 (105–117) |
| 11. INSERTs from a SELECT                       | 29.9 (28.3–33.5) |    130 (127–143) |        29.1 (27.4–31.7) | 40.9 (37.2–43.6) |
| 12. DELETE without an index                     | 26.2 (25.2–31.0) |    208 (205–214) |        28.1 (25.6–30.2) | 34.3 (29.1–56.0) |
| 13. DELETE with an index                        | 25.7 (24.0–28.1) |    192 (187–213) |        25.8 (24.2–26.4) | 32.8 (31.4–69.2) |
| 14. A big INSERT after a big DELETE             | 23.5 (22.5–26.6) | 82.8 (82.5–86.4) |        23.9 (22.4–24.1) | 31.1 (29.6–33.9) |
| 15. A big DELETE followed by many small INSERTs | 22.5 (21.2–26.7) | 85.3 (84.8–89.2) |        27.0 (24.9–27.9) | 40.2 (37.6–44.8) |
| 16. DROP TABLE                                  | 7.98 (5.99–10.2) |    304 (297–323) |        6.40 (6.31–9.38) | 7.18 (6.75–9.01) |
| Total                                           | 1679 (1618–1771) | 3284 (3212–3307) |        1865 (1660–3128) | 2032 (1880–2080) |
| Total without 1                                 |    757 (707–783) | 1885 (1809–1940) |           794 (747–802) |  1013 (973–1115) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted | @sqlite.org/sqlite-wasm |        wa-sqlite |
| ------------------------ | ---------------: | ---------------: | ----------------------: | ---------------: |
| 10000 single-row inserts | 0.68 (0.60–0.76) | 0.66 (0.60–0.88) |        1.33 (1.25–1.80) | 1.16 (1.03–1.62) |
| 10000 point selects      | 0.63 (0.59–0.69) | 0.67 (0.59–1.05) |        1.07 (1.01–1.62) | 1.06 (0.82–1.85) |
| 10 reads of 10000 rows   | 2.27 (2.18–2.53) | 2.45 (2.21–2.50) |        6.58 (6.44–7.85) | 4.56 (4.14–4.80) |

### Evolu relative to @sqlite.org/sqlite-wasm

The median over rounds of Evolu's time divided by @sqlite.org/sqlite-wasm's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / @sqlite.org/sqlite-wasm |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ------------------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |                0.91 (0.38–1.01) |        |         1.50 (1.39–1.55) |
| 2. 25000 INSERTs in a transaction               |                0.81 (0.76–1.01) |        |         1.77 (1.39–2.14) |
| 3. 25000 INSERTs into an indexed table          |                0.84 (0.79–0.97) | faster |         2.09 (1.76–2.26) |
| 4. 100 SELECTs without an index                 |                0.96 (0.92–1.05) |        |         1.01 (0.90–1.10) |
| 5. 100 SELECTs on a string comparison           |                1.05 (1.02–1.07) |        |         1.02 (0.96–1.03) |
| 6. Creating an index                            |                1.00 (0.47–1.17) |        |         1.93 (1.82–2.16) |
| 7. 5000 SELECTs with an index                   |                1.01 (0.81–1.11) |        |         0.97 (0.91–1.21) |
| 8. 1000 UPDATEs without an index                |                1.06 (0.91–1.07) |        |         1.10 (1.06–1.17) |
| 9. 25000 UPDATEs with an index                  |                0.82 (0.79–1.06) |        |         1.94 (1.67–2.08) |
| 10. 25000 text UPDATEs with an index            |                0.93 (0.74–1.05) |        |         2.01 (1.49–2.69) |
| 11. INSERTs from a SELECT                       |                1.03 (0.89–1.22) |        |         4.37 (3.83–5.08) |
| 12. DELETE without an index                     |                0.91 (0.85–1.21) |        |         7.82 (6.64–8.43) |
| 13. DELETE with an index                        |                1.00 (0.91–1.16) |        |         7.65 (6.82–7.82) |
| 14. A big INSERT after a big DELETE             |                0.98 (0.94–1.17) |        |         3.51 (3.23–3.67) |
| 15. A big DELETE followed by many small INSERTs |                0.84 (0.76–1.07) |        |         3.79 (3.26–4.00) |
| 16. DROP TABLE                                  |                1.11 (0.82–1.62) |        |      40.52 (29.53–49.62) |
| Total                                           |                0.91 (0.54–1.00) |        |         1.94 (1.85–1.99) |
| Total without 1                                 |                0.98 (0.88–1.04) |        |         2.56 (2.39–2.62) |
| 10000 single-row inserts                        |                0.45 (0.34–0.59) | faster |         0.97 (0.88–1.24) |
| 10000 point selects                             |                0.57 (0.37–0.69) | faster |         1.03 (0.92–1.71) |
| 10 reads of 10000 rows                          |                0.35 (0.28–0.39) | faster |         1.01 (0.93–1.14) |

**Verdict:** Evolu is not slower than @sqlite.org/sqlite-wasm in any metric.

### SQLite and pragmas

Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.

| Stack                   | Library                               | Binding                                    | SQLite | Source ID                      | page_size | journal_mode | synchronous | cache_size | temp_store | secure_delete | locking_mode | auto_vacuum | mmap_size |
| ----------------------- | ------------------------------------- | ------------------------------------------ | ------ | ------------------------------ | --------- | ------------ | ----------- | ---------- | ---------- | ------------- | ------------ | ----------- | --------- |
| Evolu                   | Evolu's SQLite (packages/sqlite-wasm) | Evolu's wasm layer, Evolu's pool           | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| Evolu, encrypted        | Evolu's SQLite (packages/sqlite-wasm) | Evolu's wasm layer, Evolu's pool and codec | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 1 (ON)        | normal       | 0 (NONE)    | 0         |
| @sqlite.org/sqlite-wasm | @sqlite.org/sqlite-wasm 3.54.1-build1 | oo1 API, opfs-sahpool                      | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| wa-sqlite               | wa-sqlite 7a4b4241b                   | asynchronous API, AccessHandlePoolVFS      | 3.53.0 | 2026-04-09 11:41:38 4525003a53 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |

### Compile options that differ

An empty cell is an option the build doesn't report.

| Option                      | Evolu        | Evolu, encrypted | @sqlite.org/sqlite-wasm | wa-sqlite    |
| --------------------------- | ------------ | ---------------- | ----------------------- | ------------ |
| COMPILER                    | clang-23.0.0 | clang-23.0.0     | clang-23.0.0            | clang-19.0.0 |
| DEFAULT_CACHE_SIZE          | -16384       | -16384           | -16384                  | -2000        |
| DEFAULT_MEMSTATUS           |              |                  |                         | 0            |
| DEFAULT_PAGE_SIZE           | 8192         | 8192             | 8192                    | 4096         |
| DEFAULT_WAL_SYNCHRONOUS     | 2            | 2                | 2                       | 1            |
| ENABLE_API_ARMOR            | set          | set              | set                     |              |
| ENABLE_BATCH_ATOMIC_WRITE   |              |                  |                         | set          |
| ENABLE_BYTECODE_VTAB        |              |                  | set                     |              |
| ENABLE_COLUMN_METADATA      |              |                  | set                     |              |
| ENABLE_DBPAGE_VTAB          |              |                  | set                     |              |
| ENABLE_DBSTAT_VTAB          |              |                  | set                     |              |
| ENABLE_FTS5                 |              |                  | set                     |              |
| ENABLE_MATH_FUNCTIONS       | set          | set              | set                     |              |
| ENABLE_OFFSET_SQL_FUNC      |              |                  | set                     |              |
| ENABLE_PERCENTILE           |              |                  | set                     |              |
| ENABLE_PREUPDATE_HOOK       |              |                  | set                     |              |
| ENABLE_RTREE                |              |                  | set                     |              |
| ENABLE_SESSION              |              |                  | set                     |              |
| ENABLE_STMTVTAB             |              |                  | set                     |              |
| ENABLE_UNKNOWN_SQL_FUNCTION |              |                  | set                     |              |
| LIKE_DOESNT_MATCH_BLOBS     |              |                  |                         | set          |
| MAX_EXPR_DEPTH              | 1000         | 1000             | 1000                    | 0            |
| MAX_SCHEMA                  | 10000000     | 10000000         | 10000000                |              |
| OMIT_AUTHORIZATION          | set          | set              |                         |              |
| OMIT_AUTOINIT               |              |                  |                         | set          |
| OMIT_DECLTYPE               |              |                  |                         | set          |
| OMIT_INCRBLOB               | set          | set              |                         |              |
| OMIT_INTROSPECTION_PRAGMAS  | set          | set              |                         |              |
| OMIT_PROGRESS_CALLBACK      | set          | set              |                         |              |
| OMIT_UTF16                  | set          | set              | set                     |              |
| OMIT_WAL                    | set          | set              |                         |              |
| STRICT_SUBTYPE              | set          | set              | set                     |              |
| TEMP_STORE                  | 3            | 3                | 2                       | 1            |
| USE_ALLOCA                  |              |                  |                         | set          |
| USE_URI                     | set          | set              | set                     |              |

## Firefox 157.0, macOS 26.6.2 arm64

Run 2026-10-27T12:48:05.806Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes; Browser Firefox 157.0; User agent Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0; performance.now() step 20 µs; Playwright 1.64.1.

Load averages: 3.57, 2.59, 2.08 before, 2.93, 2.60, 2.13 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted | @sqlite.org/sqlite-wasm |        wa-sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ----------------------: | ---------------: |
| 1. 1000 INSERTs                                 |    590 (551–671) |   992 (930–1057) |           638 (624–768) |   708 (638–1001) |
| 2. 25000 INSERTs in a transaction               | 53.3 (49.4–69.2) | 79.0 (78.2–84.9) |        59.9 (59.6–71.3) |    365 (342–377) |
| 3. 25000 INSERTs into an indexed table          | 83.8 (79.7–89.6) |    139 (137–141) |        90.9 (89.4–93.6) |    391 (376–401) |
| 4. 100 SELECTs without an index                 | 73.6 (71.8–75.9) | 71.8 (71.4–73.9) |        69.2 (68.2–95.0) | 76.6 (76.2–79.0) |
| 5. 100 SELECTs on a string comparison           |    298 (293–303) |    300 (293–303) |           285 (281–291) |    293 (290–294) |
| 6. Creating an index                            | 14.2 (13.7–14.8) | 25.4 (24.7–26.7) |        14.2 (14.0–14.3) | 14.0 (13.5–15.1) |
| 7. 5000 SELECTs with an index                   | 22.7 (21.2–23.5) | 21.8 (21.3–23.3) |        20.1 (19.4–21.3) |  94.5 (92.5–163) |
| 8. 1000 UPDATEs without an index                | 22.9 (22.4–24.7) | 25.6 (25.6–27.8) |        23.6 (23.0–23.8) | 37.5 (37.2–41.8) |
| 9. 25000 UPDATEs with an index                  |    140 (135–148) |    208 (207–217) |           146 (146–147) |    452 (447–460) |
| 10. 25000 text UPDATEs with an index            |    121 (113–126) |    180 (176–192) |           124 (121–366) |    433 (420–526) |
| 11. INSERTs from a SELECT                       | 69.1 (66.5–74.6) |    167 (163–178) |        69.9 (67.4–78.6) | 75.5 (73.7–78.5) |
| 12. DELETE without an index                     |    144 (133–193) |    310 (309–439) |           136 (131–164) |    137 (136–192) |
| 13. DELETE with an index                        | 53.3 (52.0–54.1) |    274 (272–346) |        53.8 (51.7–67.6) | 59.0 (57.9–63.2) |
| 14. A big INSERT after a big DELETE             | 46.1 (45.1–48.5) |    106 (102–126) |        47.5 (45.3–69.2) | 53.0 (52.5–56.4) |
| 15. A big DELETE followed by many small INSERTs | 41.2 (40.0–49.4) |    122 (121–130) |        47.5 (45.0–59.5) |    186 (182–244) |
| 16. DROP TABLE                                  | 3.92 (3.68–4.18) |    460 (457–487) |        4.24 (4.04–4.30) | 4.34 (4.10–4.48) |
| Total                                           | 1811 (1715–1869) | 3484 (3401–3742) |        1841 (1810–2219) | 3448 (3242–3675) |
| Total without 1                                 | 1202 (1164–1222) | 2492 (2471–2726) |        1217 (1173–1452) | 2686 (2604–2909) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted | @sqlite.org/sqlite-wasm |        wa-sqlite |
| ------------------------ | ---------------: | ---------------: | ----------------------: | ---------------: |
| 10000 single-row inserts | 0.76 (0.70–0.78) | 0.84 (0.72–2.30) |        1.26 (1.21–1.57) | 6.13 (6.07–6.25) |
| 10000 point selects      | 0.77 (0.75–0.91) | 0.81 (0.75–2.89) |        1.32 (1.26–1.50) | 6.17 (6.10–6.26) |
| 10 reads of 10000 rows   | 2.40 (2.35–2.78) | 2.58 (2.39–6.10) |        8.80 (8.23–9.63) | 29.8 (29.3–31.3) |

### Evolu relative to @sqlite.org/sqlite-wasm

The median over rounds of Evolu's time divided by @sqlite.org/sqlite-wasm's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / @sqlite.org/sqlite-wasm |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ------------------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |                0.93 (0.75–0.98) |        |         1.68 (1.57–1.77) |
| 2. 25000 INSERTs in a transaction               |                0.86 (0.79–1.16) |        |         1.47 (1.14–1.61) |
| 3. 25000 INSERTs into an indexed table          |                0.93 (0.85–0.98) |        |         1.64 (1.57–1.72) |
| 4. 100 SELECTs without an index                 |                1.06 (0.76–1.08) |        |         0.97 (0.95–1.03) |
| 5. 100 SELECTs on a string comparison           |                1.05 (1.02–1.06) |        |         1.00 (0.97–1.03) |
| 6. Creating an index                            |                1.00 (0.98–1.06) |        |         1.81 (1.67–1.84) |
| 7. 5000 SELECTs with an index                   |                1.11 (1.07–1.13) | slower |         0.99 (0.95–1.02) |
| 8. 1000 UPDATEs without an index                |                0.98 (0.94–1.05) |        |         1.14 (1.04–1.21) |
| 9. 25000 UPDATEs with an index                  |                0.95 (0.92–1.01) |        |         1.54 (1.40–1.55) |
| 10. 25000 text UPDATEs with an index            |                0.98 (0.34–1.01) |        |         1.49 (1.43–1.59) |
| 11. INSERTs from a SELECT                       |                1.00 (0.88–1.07) |        |         2.45 (2.38–2.46) |
| 12. DELETE without an index                     |                1.01 (0.88–1.44) |        |         2.23 (1.60–3.26) |
| 13. DELETE with an index                        |                1.00 (0.80–1.01) |        |         5.27 (5.14–6.40) |
| 14. A big INSERT after a big DELETE             |                1.00 (0.67–1.02) |        |         2.34 (2.20–2.73) |
| 15. A big DELETE followed by many small INSERTs |                0.87 (0.70–0.97) | faster |         3.01 (2.55–3.15) |
| 16. DROP TABLE                                  |                0.94 (0.87–1.00) |        |   121.94 (109.42–124.91) |
| Total                                           |                0.95 (0.80–1.00) |        |         1.98 (1.89–2.11) |
| Total without 1                                 |                0.96 (0.83–1.04) |        |         2.12 (2.04–2.27) |
| 10000 single-row inserts                        |                0.58 (0.50–0.63) | faster |         1.16 (0.93–3.04) |
| 10000 point selects                             |                0.60 (0.56–0.61) | faster |         1.08 (0.83–3.82) |
| 10 reads of 10000 rows                          |                0.29 (0.26–0.29) | faster |         1.05 (1.00–2.60) |

**Verdict:** Evolu is slower than @sqlite.org/sqlite-wasm in 7. 5000 SELECTs with an index.

### SQLite and pragmas

Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.

| Stack                   | Library                               | Binding                                    | SQLite | Source ID                      | page_size | journal_mode | synchronous | cache_size | temp_store | secure_delete | locking_mode | auto_vacuum | mmap_size |
| ----------------------- | ------------------------------------- | ------------------------------------------ | ------ | ------------------------------ | --------- | ------------ | ----------- | ---------- | ---------- | ------------- | ------------ | ----------- | --------- |
| Evolu                   | Evolu's SQLite (packages/sqlite-wasm) | Evolu's wasm layer, Evolu's pool           | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| Evolu, encrypted        | Evolu's SQLite (packages/sqlite-wasm) | Evolu's wasm layer, Evolu's pool and codec | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 1 (ON)        | normal       | 0 (NONE)    | 0         |
| @sqlite.org/sqlite-wasm | @sqlite.org/sqlite-wasm 3.54.1-build1 | oo1 API, opfs-sahpool                      | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| wa-sqlite               | wa-sqlite 7a4b4241b                   | asynchronous API, AccessHandlePoolVFS      | 3.53.0 | 2026-04-09 11:41:38 4525003a53 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |

### Compile options that differ

An empty cell is an option the build doesn't report.

| Option                      | Evolu        | Evolu, encrypted | @sqlite.org/sqlite-wasm | wa-sqlite    |
| --------------------------- | ------------ | ---------------- | ----------------------- | ------------ |
| COMPILER                    | clang-23.0.0 | clang-23.0.0     | clang-23.0.0            | clang-19.0.0 |
| DEFAULT_CACHE_SIZE          | -16384       | -16384           | -16384                  | -2000        |
| DEFAULT_MEMSTATUS           |              |                  |                         | 0            |
| DEFAULT_PAGE_SIZE           | 8192         | 8192             | 8192                    | 4096         |
| DEFAULT_WAL_SYNCHRONOUS     | 2            | 2                | 2                       | 1            |
| ENABLE_API_ARMOR            | set          | set              | set                     |              |
| ENABLE_BATCH_ATOMIC_WRITE   |              |                  |                         | set          |
| ENABLE_BYTECODE_VTAB        |              |                  | set                     |              |
| ENABLE_COLUMN_METADATA      |              |                  | set                     |              |
| ENABLE_DBPAGE_VTAB          |              |                  | set                     |              |
| ENABLE_DBSTAT_VTAB          |              |                  | set                     |              |
| ENABLE_FTS5                 |              |                  | set                     |              |
| ENABLE_MATH_FUNCTIONS       | set          | set              | set                     |              |
| ENABLE_OFFSET_SQL_FUNC      |              |                  | set                     |              |
| ENABLE_PERCENTILE           |              |                  | set                     |              |
| ENABLE_PREUPDATE_HOOK       |              |                  | set                     |              |
| ENABLE_RTREE                |              |                  | set                     |              |
| ENABLE_SESSION              |              |                  | set                     |              |
| ENABLE_STMTVTAB             |              |                  | set                     |              |
| ENABLE_UNKNOWN_SQL_FUNCTION |              |                  | set                     |              |
| LIKE_DOESNT_MATCH_BLOBS     |              |                  |                         | set          |
| MAX_EXPR_DEPTH              | 1000         | 1000             | 1000                    | 0            |
| MAX_SCHEMA                  | 10000000     | 10000000         | 10000000                |              |
| OMIT_AUTHORIZATION          | set          | set              |                         |              |
| OMIT_AUTOINIT               |              |                  |                         | set          |
| OMIT_DECLTYPE               |              |                  |                         | set          |
| OMIT_INCRBLOB               | set          | set              |                         |              |
| OMIT_INTROSPECTION_PRAGMAS  | set          | set              |                         |              |
| OMIT_PROGRESS_CALLBACK      | set          | set              |                         |              |
| OMIT_UTF16                  | set          | set              | set                     |              |
| OMIT_WAL                    | set          | set              |                         |              |
| STRICT_SUBTYPE              | set          | set              | set                     |              |
| TEMP_STORE                  | 3            | 3                | 2                       | 1            |
| USE_ALLOCA                  |              |                  |                         | set          |
| USE_URI                     | set          | set              | set                     |              |

## WebKit 27.2, macOS 26.6.2 arm64

Run 2026-10-27T12:49:21.899Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes; Browser WebKit 27.2; User agent Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15; performance.now() step 20 µs; Playwright 1.64.1.

Load averages: 2.78, 2.57, 2.12 before, 3.38, 2.72, 2.19 after.

Milliseconds: the median of 5 measured rounds after 1 warm-up round, with the fastest and slowest run in parentheses.

### wa-sqlite's workloads

| Workload                                        |            Evolu | Evolu, encrypted | @sqlite.org/sqlite-wasm |        wa-sqlite |
| ----------------------------------------------- | ---------------: | ---------------: | ----------------------: | ---------------: |
| 1. 1000 INSERTs                                 |    159 (150–200) |    527 (487–546) |           197 (170–223) |    190 (175–203) |
| 2. 25000 INSERTs in a transaction               | 33.1 (28.8–33.6) | 55.0 (54.1–58.7) |        34.2 (33.3–37.4) | 47.6 (46.5–53.1) |
| 3. 25000 INSERTs into an indexed table          | 48.5 (44.4–64.3) |  99.7 (95.7–101) |        49.9 (47.8–56.9) | 63.9 (59.7–69.4) |
| 4. 100 SELECTs without an index                 | 56.0 (53.0–62.7) | 54.5 (52.9–55.9) |        55.2 (54.7–56.6) | 58.5 (58.3–59.0) |
| 5. 100 SELECTs on a string comparison           |    220 (220–235) |    220 (218–225) |           194 (193–220) |    214 (213–216) |
| 6. Creating an index                            | 7.70 (7.40–9.78) | 18.1 (17.6–18.9) |        7.32 (7.18–8.82) | 7.52 (7.28–7.66) |
| 7. 5000 SELECTs with an index                   | 19.1 (16.1–21.4) | 17.2 (16.6–19.4) |        13.3 (13.2–16.0) | 18.3 (17.9–18.5) |
| 8. 1000 UPDATEs without an index                | 16.0 (15.3–17.0) | 18.4 (18.1–19.1) |        15.8 (15.7–16.7) | 18.1 (17.9–18.5) |
| 9. 25000 UPDATEs with an index                  | 67.9 (66.4–70.5) |    132 (131–133) |        67.2 (66.1–72.7) | 84.9 (81.6–99.3) |
| 10. 25000 text UPDATEs with an index            | 51.1 (49.8–53.9) |    109 (108–111) |        53.8 (53.1–59.4) | 66.2 (65.6–96.0) |
| 11. INSERTs from a SELECT                       | 21.9 (21.1–22.0) |    110 (108–111) |        21.7 (20.9–22.4) | 22.2 (21.2–23.4) |
| 12. DELETE without an index                     | 16.0 (15.7–76.0) |    177 (174–177) |        15.9 (15.6–21.9) | 17.3 (16.6–19.3) |
| 13. DELETE with an index                        | 18.3 (18.0–18.6) |    158 (157–161) |        18.4 (17.8–20.1) | 19.0 (18.4–20.1) |
| 14. A big INSERT after a big DELETE             | 17.6 (17.5–17.6) | 70.3 (68.9–72.8) |        17.3 (17.1–17.4) | 17.7 (17.4–18.9) |
| 15. A big DELETE followed by many small INSERTs | 16.4 (15.9–17.0) | 73.0 (70.9–74.9) |        17.6 (16.4–19.2) | 24.8 (24.1–25.1) |
| 16. DROP TABLE                                  | 1.52 (1.42–1.70) |    259 (253–265) |        1.64 (1.60–1.78) | 1.66 (1.56–1.78) |
| Total                                           |    793 (759–856) | 2099 (2040–2139) |           799 (757–831) |    891 (849–909) |
| Total without 1                                 |    628 (599–682) | 1584 (1547–1593) |           587 (576–634) |    688 (670–734) |

### Driver workload

Microseconds per call for the inserts and point selects, and milliseconds per read of every row.

| Operation                |            Evolu | Evolu, encrypted | @sqlite.org/sqlite-wasm |        wa-sqlite |
| ------------------------ | ---------------: | ---------------: | ----------------------: | ---------------: |
| 10000 single-row inserts | 0.45 (0.44–0.55) | 0.48 (0.43–0.57) |        0.94 (0.88–1.02) | 0.68 (0.68–0.71) |
| 10000 point selects      | 0.49 (0.48–0.59) | 0.49 (0.47–0.56) |        0.98 (0.90–1.05) | 0.72 (0.69–0.74) |
| 10 reads of 10000 rows   | 1.95 (1.93–2.35) | 2.00 (1.94–2.33) |        6.15 (5.87–6.63) | 3.93 (3.90–4.00) |

### Evolu relative to @sqlite.org/sqlite-wasm

The median over rounds of Evolu's time divided by @sqlite.org/sqlite-wasm's in the same round, with the range. A ratio is slower or faster when its median is beyond 1.1 or its inverse and every round agrees. The last column divides Evolu, encrypted's time by Evolu's, what encryption costs.

| Metric                                          | Evolu / @sqlite.org/sqlite-wasm |        | Evolu, encrypted / Evolu |
| ----------------------------------------------- | ------------------------------: | ------ | -----------------------: |
| 1. 1000 INSERTs                                 |                0.90 (0.71–1.02) |        |         3.23 (2.73–3.54) |
| 2. 25000 INSERTs in a transaction               |                0.90 (0.86–0.98) | faster |         1.75 (1.64–1.96) |
| 3. 25000 INSERTs into an indexed table          |                0.99 (0.93–1.13) |        |         2.06 (1.49–2.16) |
| 4. 100 SELECTs without an index                 |                1.02 (0.96–1.14) |        |         0.97 (0.84–1.03) |
| 5. 100 SELECTs on a string comparison           |                1.14 (1.00–1.22) | slower |         1.00 (0.94–1.01) |
| 6. Creating an index                            |                1.02 (0.87–1.36) |        |         2.37 (1.85–2.45) |
| 7. 5000 SELECTs with an index                   |                1.27 (1.19–1.61) | slower |         1.01 (0.80–1.05) |
| 8. 1000 UPDATEs without an index                |                1.01 (0.97–1.02) |        |         1.18 (1.08–1.19) |
| 9. 25000 UPDATEs with an index                  |                1.00 (0.92–1.05) |        |         1.93 (1.87–1.98) |
| 10. 25000 text UPDATEs with an index            |                0.94 (0.86–1.01) |        |         2.15 (2.01–2.20) |
| 11. INSERTs from a SELECT                       |                1.00 (0.97–1.05) |        |         5.06 (4.94–5.19) |
| 12. DELETE without an index                     |                1.01 (0.99–3.47) |        |       11.07 (2.30–11.22) |
| 13. DELETE with an index                        |                1.00 (0.91–1.03) |        |         8.64 (8.51–8.74) |
| 14. A big INSERT after a big DELETE             |                1.02 (1.01–1.03) |        |         4.01 (3.92–4.15) |
| 15. A big DELETE followed by many small INSERTs |                0.96 (0.85–0.98) |        |         4.41 (4.21–4.68) |
| 16. DROP TABLE                                  |                0.90 (0.87–0.96) | faster |   174.57 (152.62–178.27) |
| Total                                           |                1.02 (0.92–1.13) |        |         2.70 (2.38–2.77) |
| Total without 1                                 |                1.06 (0.97–1.16) |        |         2.49 (2.28–2.64) |
| 10000 single-row inserts                        |                0.51 (0.47–0.54) | faster |         1.04 (0.97–1.10) |
| 10000 point selects                             |                0.53 (0.49–0.56) | faster |         1.00 (0.93–1.02) |
| 10 reads of 10000 rows                          |                0.32 (0.31–0.35) | faster |         1.00 (0.99–1.04) |

**Verdict:** Evolu is slower than @sqlite.org/sqlite-wasm in 5. 100 SELECTs on a string comparison; 7. 5000 SELECTs with an index.

### SQLite and pragmas

Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.

| Stack                   | Library                               | Binding                                    | SQLite | Source ID                      | page_size | journal_mode | synchronous | cache_size | temp_store | secure_delete | locking_mode | auto_vacuum | mmap_size |
| ----------------------- | ------------------------------------- | ------------------------------------------ | ------ | ------------------------------ | --------- | ------------ | ----------- | ---------- | ---------- | ------------- | ------------ | ----------- | --------- |
| Evolu                   | Evolu's SQLite (packages/sqlite-wasm) | Evolu's wasm layer, Evolu's pool           | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| Evolu, encrypted        | Evolu's SQLite (packages/sqlite-wasm) | Evolu's wasm layer, Evolu's pool and codec | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 1 (ON)        | normal       | 0 (NONE)    | 0         |
| @sqlite.org/sqlite-wasm | @sqlite.org/sqlite-wasm 3.54.1-build1 | oo1 API, opfs-sahpool                      | 3.54.1 | 2026-10-16 14:45:20 555e07ef33 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |
| wa-sqlite               | wa-sqlite 7a4b4241b                   | asynchronous API, AccessHandlePoolVFS      | 3.53.0 | 2026-04-09 11:41:38 4525003a53 | 4096      | delete       | 2 (FULL)    | -16000     | 2 (MEMORY) | 0 (OFF)       | normal       | 0 (NONE)    | 0         |

### Compile options that differ

An empty cell is an option the build doesn't report.

| Option                      | Evolu        | Evolu, encrypted | @sqlite.org/sqlite-wasm | wa-sqlite    |
| --------------------------- | ------------ | ---------------- | ----------------------- | ------------ |
| COMPILER                    | clang-23.0.0 | clang-23.0.0     | clang-23.0.0            | clang-19.0.0 |
| DEFAULT_CACHE_SIZE          | -16384       | -16384           | -16384                  | -2000        |
| DEFAULT_MEMSTATUS           |              |                  |                         | 0            |
| DEFAULT_PAGE_SIZE           | 8192         | 8192             | 8192                    | 4096         |
| DEFAULT_WAL_SYNCHRONOUS     | 2            | 2                | 2                       | 1            |
| ENABLE_API_ARMOR            | set          | set              | set                     |              |
| ENABLE_BATCH_ATOMIC_WRITE   |              |                  |                         | set          |
| ENABLE_BYTECODE_VTAB        |              |                  | set                     |              |
| ENABLE_COLUMN_METADATA      |              |                  | set                     |              |
| ENABLE_DBPAGE_VTAB          |              |                  | set                     |              |
| ENABLE_DBSTAT_VTAB          |              |                  | set                     |              |
| ENABLE_FTS5                 |              |                  | set                     |              |
| ENABLE_MATH_FUNCTIONS       | set          | set              | set                     |              |
| ENABLE_OFFSET_SQL_FUNC      |              |                  | set                     |              |
| ENABLE_PERCENTILE           |              |                  | set                     |              |
| ENABLE_PREUPDATE_HOOK       |              |                  | set                     |              |
| ENABLE_RTREE                |              |                  | set                     |              |
| ENABLE_SESSION              |              |                  | set                     |              |
| ENABLE_STMTVTAB             |              |                  | set                     |              |
| ENABLE_UNKNOWN_SQL_FUNCTION |              |                  | set                     |              |
| LIKE_DOESNT_MATCH_BLOBS     |              |                  |                         | set          |
| MAX_EXPR_DEPTH              | 1000         | 1000             | 1000                    | 0            |
| MAX_SCHEMA                  | 10000000     | 10000000         | 10000000                |              |
| OMIT_AUTHORIZATION          | set          | set              |                         |              |
| OMIT_AUTOINIT               |              |                  |                         | set          |
| OMIT_DECLTYPE               |              |                  |                         | set          |
| OMIT_INCRBLOB               | set          | set              |                         |              |
| OMIT_INTROSPECTION_PRAGMAS  | set          | set              |                         |              |
| OMIT_PROGRESS_CALLBACK      | set          | set              |                         |              |
| OMIT_UTF16                  | set          | set              | set                     |              |
| OMIT_WAL                    | set          | set              |                         |              |
| STRICT_SUBTYPE              | set          | set              | set                     |              |
| TEMP_STORE                  | 3            | 3                | 2                       | 1            |
| USE_ALLOCA                  |              |                  |                         | set          |
| USE_URI                     | set          | set              | set                     |              |

## Relay regression gate

Run 2026-10-27T10:42:08.736Z. CPU Apple M5, 10 cores, 16 GiB; OS macOS 26.6.2 arm64; Node.js 24.22.0; Checkout 0a9a95ebc with uncommitted changes. Load averages 1.85, 2.27, 2.47 before, 1.95, 2.27, 2.47 after.

- Old: `abde2972c` Note why @evolu/common's worker hops don't recover from another task's throw on React Native: better-sqlite3 13.0.3, Storage on recursive CTEs
- New: `0a9a95ebc` Speed up @evolu/nodejs's SQLite binding by building its rows in JavaScript (with uncommitted changes): Evolu's SQLite (@evolu/nodejs's addon), Storage on the C skiplist functions

Each run is a fresh process and a fresh `relay.db`, opened as each checkout's relay opens it. It writes 50000 messages of 100 to 1000 bytes in batches of 500, takes 200 fingerprints of 16 buckets, iterates every timestamp 5 times and reads 10000 random changes. Rounds alternate which checkout runs first. Milliseconds: the median of 5 measured runs after 1 warm-up, with the fastest and slowest in parentheses; the ratio is the median of new/old in the same round.

Both checkouts returned the same fingerprints, iterations and reads in every run (50000 timestamps).

| Metric                            |              Old |              New |        New / old |        |
| --------------------------------- | ---------------: | ---------------: | ---------------: | ------ |
| 50000 writes in batches of 500    |    472 (455–479) |    350 (342–356) | 0.74 (0.72–0.77) | faster |
| 200 fingerprints of 16 buckets    |    136 (135–167) | 14.8 (14.3–15.8) | 0.11 (0.09–0.11) | faster |
| Iterating every timestamp 5 times | 88.6 (88.0–89.5) | 61.1 (59.9–62.7) | 0.69 (0.67–0.71) | faster |
| 10000 random reads of a change    | 54.0 (52.4–55.3) | 52.0 (51.5–52.3) | 0.96 (0.94–1.00) |        |
| Total                             |    753 (735–782) |    477 (468–485) | 0.64 (0.61–0.65) | faster |

Database file: 43700224 bytes old, 43839488 bytes new.

**Verdict:** the new code is not slower in any metric (a ratio is slower when its median is above 1.1 and every round agrees).
