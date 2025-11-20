# Examples

## Testing examples

To test an example, move its directory out of Evolu monorepo. Otherwise, package managers will not work correctly. Examples are meant to work in isolation.

If you are using Yarn, you must install peer dependencies manually.

## Toggle dependencies

```bash
pnpm examples:toggle-deps
```

This script toggles all example dependencies between:

- **Development**: `workspace:*` (uses local monorepo packages)
- **Production**: `latest` (uses published packages)
