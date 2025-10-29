# Examples

## Dependency Management

During the preview phase, examples use monorepo dependencies (`workspace:*`) for local development and testing. After the official release, dependencies will point to published packages on npm.

To switch between development and production modes, use:

```bash
pnpm examples:toggle-deps
```

This script toggles all example dependencies between:

- **Development**: `workspace:*` (uses local monorepo packages)
- **Production**: `npm:@evolu/package@latest` (uses published packages)

## Testing Examples

To test an example, move its directory out of Evolu monorepo. Otherwise, package managers will not work correctly. Examples are meant to work in isolation.

If you are using Yarn, you must install peer dependencies manually.
