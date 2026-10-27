# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

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
