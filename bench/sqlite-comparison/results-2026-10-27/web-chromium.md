# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

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
