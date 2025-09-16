# Angular Vite PWA

Evolu's **Vanilla JS API** works with any framework, including Angular, as shown in this example.

## Quick start

```bash
# From the repository root...
pnpm install
pnpm --filter @evolu/common --filter @evolu/web build

# Start development server
pnpm --filter @example/angular-vite-pwa dev

# Build to test the PWA
pnpm --filter @example/angular-vite-pwa build

# Then serve, for example...
python3 -m http.server --directory examples/angular-vite-pwa/dist
```

## Prerequisites

Assuming you already have a [working Angular project](https://angular.dev/installation), mirror the development dependencies in [`package.json`](package.json). Naturally, Tailwind is optional.

### Build pipeline

Instead of the Angular CLI, this example uses
`@analogjs/vite-plugin-angular` for a [custom build
pipeline](https://angular.dev/ecosystem/custom-build-pipeline#vite).

Together with a custom Vite config,
it ensures Evolu's WASM and worker files are included in the bundle.

### Configure Vite and TypeScript

Create or adapt the following files as shown in this example:

- [`vite.config.ts`](vite.config.ts) – make sure to keep `optimizeDeps.exclude` so Evolu's assets
  bundle correctly, and adapt as needed.
- [`src/vite-env.d.ts`](src/vite-env.d.ts)
- [`pwa-assets.config.ts`](pwa-assets.config.ts).
- [`tsconfig.app.json`](tsconfig.app.json) – exactly this filename is expected by
  `@analogjs/vite-plugin-angular`.

### PWA Management

See [`src/app/pwa-badge.component.ts`](src/app/pwa-badge.component.ts) for a possible
implementation.

### Using Evolu with Angular

Consider these patterns to use Evolu with Angular:

- [`src/app/app.config.ts`](src/app/app.config.ts) provides a global Evolu instance via an Angular injection token.
- [`src/app/app.service.ts`](src/app/app.service.ts) shows how to work with Evolu queries using Angular signals. See `loadAndSubscribeEvoluQuery`.

For more details, see the Vanilla JS [Evolu docs](https://evolu.dev/docs/).

## FAQ

### Why not the Angular CLI?

The Angular CLI doesn't automatically include static files that Evolu relies on. If you wish to use it, you'll need to manually identify and expose all `assets` in `angular.json`.

### Why not the Angular service worker?

Vite and `VitePWA` integrate smoothly.

The Angular service worker requires a custom plugin. A possible implementation is available in [this repository](https://github.com/brandonroberts/analog-service-worker/blob/aa6961f4727743bb81de3d7bbcfda93c5429aa8c/vite.config.ts#L9-L24).
