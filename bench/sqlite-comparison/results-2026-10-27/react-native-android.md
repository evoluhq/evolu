# SQLite comparison

Every stack runs wa-sqlite's 16 benchmark workloads, at commit 7a4b4241b, one statement at a time, and the driver workload, each run on fresh databases. Every connection first runs `PRAGMA page_size = 4096`, `PRAGMA journal_mode = DELETE`, `PRAGMA synchronous = FULL`, `PRAGMA cache_size = -16000`, `PRAGMA temp_store = MEMORY`, `PRAGMA secure_delete = OFF`.

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
