# @evolu/typescript-config

## 0.1.1

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

- f0aa036: Stopped including separate library test directories

  The library configuration now includes only `src`. Projects with tests or a Vitest configuration outside `src` must add those paths to their own TypeScript configuration.

## 0.1.0

### Minor Changes

- 4aa82e4: Published strict TypeScript configurations for Evolu projects

  The package includes configurations for:

  - ESM libraries, with a React variant
  - Node.js projects, with variants for compiled executables and directly
    executed TypeScript scripts
