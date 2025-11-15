---
"@evolu/common": patch
---

Evolu Relay storage made stateless

Timestamp insertion strategy state moved from in-memory Map to evolu_usage table. This makes Evolu Relay fully stateless and suitable for serverless environments like AWS Lambda and Cloudflare Workers with Durable Objects.

The evolu_usage table must be read and written on every message write anyway (for quota checks), so it's natural to use it also for tracking timestamp bounds.

Evolu Relay is designed to work everywhere SQLite works, and with little effort, also with any other SQL database. The core logic is implemented in the language which is very fast and where data is, which is why it's not Rust but SQL 🤓
