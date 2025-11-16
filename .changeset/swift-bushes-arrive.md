---
"@evolu/relay": patch
---

Reduce Docker image size and improve runtime defaults.

- Use `pnpm deploy --prod --legacy` to ship a minimal runtime; image ~116 MB (≈59 MB compressed).
- Set `NODE_ENV=production` and add a robust TCP healthcheck.
- Persist data under `/app/data` (declare VOLUME, ensure dir) and fix compose volume mapping.
- Streamline README: concise Docker build/run with logs; remove web‑app testing section; place local steps under Docker.
