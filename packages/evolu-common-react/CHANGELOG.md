# @evolu/common-react

## 1.0.9

### Patch Changes

- e392fe8: Allow to disable React Suspense per useQuery

  React Suspense is enabled by default but can be optionally disabled
  per useQuery hook. When disabled, useQuery will not stop rendering
  and will return empty rows instead.

  That can be helpful to avoid waterfall when using more than one
  useQuery within one React Component. In such a situation, disable
  Suspense for all useQuery hooks except the last one.

  Because Evolu queues queries within a microtask sequentially, all
  queries will be batched within one roundtrip.

  Another use case is to optimistically prefetch data that might be
  needed in a future render without blocking the current render.

## 1.0.8

### Patch Changes

- 51ead17: Make useQuery filterMap optional and reusable
- 8eaff48: Remove conditional queryCallback

  Conditional useQuery callback wasn't documented, and it's an antipattern. With Kysely Relations, it's possible to nest related rows in queries now.

- Updated dependencies [db84a4e]
- Updated dependencies [51ead17]
  - @evolu/common@1.0.15

## 1.0.7

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/common@1.0.10

## 1.0.6

### Patch Changes

- ad267b4: Update deps
- Updated dependencies [ad267b4]
  - @evolu/common@1.0.9

## 1.0.5

### Patch Changes

- a938b3d: Update deps
- Updated dependencies [a938b3d]
  - @evolu/common@1.0.7

## 1.0.4

### Patch Changes

- 43ae617: Update peer dependencies
- Updated dependencies [43ae617]
  - @evolu/common@1.0.6

## 1.0.3

### Patch Changes

- c406a60: Update deps
- Updated dependencies [c406a60]
  - @evolu/common@1.0.3

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency
- Updated dependencies [0a6f7e7]
  - @evolu/common@1.0.2

## 1.0.1

### Patch Changes

- 768427c: Fix files in @evolu/common-react package.json

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/common@1.0.0
