# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

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
