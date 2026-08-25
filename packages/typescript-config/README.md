# @evolu/typescript-config

Strict TypeScript configurations for Evolu projects.

## Setup

```sh
pnpm add -D @evolu/typescript-config typescript
```

Extend the configuration for Evolu libraries:

```json
{
  "extends": "@evolu/typescript-config/library.json"
}
```

React libraries can extend the React library configuration:

```json
{
  "extends": "@evolu/typescript-config/library-react.json"
}
```

For Node.js executables and scripts, also install the Node.js types:

```sh
pnpm add -D @types/node
```

Projects with a custom Node.js build shape can extend the Node.js configuration
directly:

```json
{
  "extends": "@evolu/typescript-config/node.json"
}
```

Node.js executables can use the composite configuration that emits the `src`
tree under `dist`:

```json
{
  "extends": "@evolu/typescript-config/executable.json"
}
```

Node.js scripts executed directly from TypeScript can use the non-emitting
script configuration:

```json
{
  "extends": "@evolu/typescript-config/script.json"
}
```
