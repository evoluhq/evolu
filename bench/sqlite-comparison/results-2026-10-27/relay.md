# Relay regression gate

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
