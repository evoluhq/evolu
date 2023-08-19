---
"evolu": patch
---

Remove `import "client-only";`

It's not well-documented, and nobody is using it. While 'server-only' makes sense because of security, 'client-only' is only for a hint that is detected by React/Next.js anyway.
