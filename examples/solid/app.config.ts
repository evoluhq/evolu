import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  // Avoid error: 
  // [vite:worker-import-meta-url] Invalid value "iife" for option "output.format" - UMD and IIFE output formats are not supported for code-splitting builds.
  // @see https://www.fardeem.com/notes/using-langchain-inside-a-vite-worker
  vite: {
    worker: {
      format: "es",
    },
  },
});
