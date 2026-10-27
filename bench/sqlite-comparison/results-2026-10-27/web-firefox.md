# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

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
