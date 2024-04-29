import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
// import devtools from 'solid-devtools/vite';

export default defineConfig({
  optimizeDeps: {
    // A workaround for Vite bug: https://github.com/vitejs/vite/issues/13314#issuecomment-1560745780
    exclude: ["@evolu/solid"],
    // Another workaround for Vite bug: https://github.com/radix-ui/primitives/discussions/1915#discussioncomment-5733178
    // include: ["react-dom"],
  },
  worker: {
    format: "es",
  },
  plugins: [
    /* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    // devtools(),
    solidPlugin(),
  ],
  server: {
    port: 3000,
  },
  // build: {
  //   target: 'esnext',
  // },
});
