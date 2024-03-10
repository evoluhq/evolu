---
"@evolu/server": patch
---

Fix "Content-Type" for Cloudflare Workers

Cloudflare Workers content compression doesn't support "application/octet-stream," and it can't be easily enabled. But it supports "application/x-protobuf," which is what Evolu actually uses. As I tested, it's not a breaking change. The only effect is that Cloudflare Workers has started to use compression.

https://developers.cloudflare.com/speed/optimization/content/brotli/content-compression/
