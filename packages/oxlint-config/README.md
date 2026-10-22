# @evolu/oxlint-config

Strict Oxlint configuration and custom rules for Evolu projects.

## Setup

```sh
pnpm add -D @evolu/oxlint-config oxlint oxlint-tsgolint
```

Create `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": ["./node_modules/@evolu/oxlint-config/config.jsonc"],
  "options": {
    "reportUnusedDisableDirectives": "error"
  }
}
```

`reportUnusedDisableDirectives` must be configured in the project root and
cannot be inherited from the shared configuration.

Add the lint script:

```json
{
  "scripts": {
    "lint": "oxlint ."
  }
}
```

Project-specific rules and overrides can be added to `.oxlintrc.json`.

The configuration permits type-only dependency cycles and rejects runtime
dependency cycles.

The bundled `no-unnecessary-global-this` rule keeps `globalThis` when a global
name overlaps a local or exported API, when code checks for an optional global,
or when code intentionally mutates the global object. Other qualifications are
reported and safely fixed where changing the receiver cannot affect behavior.

## Source and tests

The npm package includes configuration, source, and tests matching the installed version in
`node_modules/@evolu/oxlint-config/`. The links below open GitHub's `main`
branch; use the installed files when checking version-specific behavior.

- [`config.jsonc`](https://github.com/evoluhq/evolu/blob/main/packages/oxlint-config/config.jsonc) lists the configured rules and overrides.
- [`src/plugin.mjs`](https://github.com/evoluhq/evolu/blob/main/packages/oxlint-config/src/plugin.mjs) contains the custom rules and their
  documentation.
- [`src/plugin.test.ts`](https://github.com/evoluhq/evolu/blob/main/packages/oxlint-config/src/plugin.test.ts) shows accepted and rejected code
  and expected automatic fixes.

For project configuration, use the `exports` in the installed package's
`package.json`. Relative imports in tests may access internal helpers.
