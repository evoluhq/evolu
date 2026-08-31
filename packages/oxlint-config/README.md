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
