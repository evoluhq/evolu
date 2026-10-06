// Serves apps/web/out locally the way Cloudflare does, for `pnpm --filter web
// start` and the E2E tests. It is `wrangler dev` without the assets watcher:
// the watcher keeps a file descriptor open per exported file, and on macOS
// the export's ~14,000 files push descriptor numbers so high that spawning
// esbuild fails with `spawn EBADF`. The CLI cannot turn the watcher off.
// Related, closed: https://github.com/cloudflare/workers-sdk/issues/13890 only
// made the watcher survive EMFILE; no upstream issue covers this EBADF.
import { join } from "node:path";
import { parseArgs } from "node:util";
import { unstable_startWorker } from "wrangler";

const { values } = parseArgs({
  options: {
    ip: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "3000" },
  },
});

// Wrangler logs the address once it is ready.
const worker = await unstable_startWorker({
  config: join(import.meta.dirname, "wrangler.jsonc"),
  dev: {
    watch: false,
    server: { hostname: values.ip, port: Number(values.port) },
  },
});

// startWorker only debug-logs a failed start, such as a port in use, and keeps
// running.
worker.raw.on("error", () => process.exit(1));
