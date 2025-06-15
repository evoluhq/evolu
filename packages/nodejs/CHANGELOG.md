# @evolu/nodejs

## 1.0.1-preview.4

### Patch Changes

- d319317: Ensure "Evolu Relay started" is always logged
- Updated dependencies [f5e4232]
  - @evolu/common@6.0.1-preview.7

## 1.0.1-preview.3

### Patch Changes

- c86cb14: Add timing-safe comparison for WriteKey validation

  ### Security Improvements

  - Add `TimingSafeEqual` type and `TimingSafeEqualDep` interface for platform-independent timing-safe comparison
  - Implement Node.js timing-safe comparison using `crypto.timingSafeEqual()`
  - Replace vulnerable `eqArrayNumber` WriteKey comparison with constant-time algorithm to prevent timing attacks

- Updated dependencies [c86cb14]
  - @evolu/common@6.0.1-preview.5

## 1.0.1-preview.2

### Patch Changes

- 2a37317: Update dependencies
- Updated dependencies [2a37317]
- Updated dependencies [39cbd9b]
  - @evolu/common@6.0.1-preview.3

## 1.0.1-preview.1

### Patch Changes

- 8ff21e5: GitHub release
- Updated dependencies [8ff21e5]
  - @evolu/common@6.0.1-preview.2

## 1.0.1-preview.0

### Patch Changes

- 632768f: Preview release
- Updated dependencies [632768f]
  - @evolu/common@6.0.1-preview.0

## 1.0.0

### Major Changes

- Updated to use new Evolu architecture
