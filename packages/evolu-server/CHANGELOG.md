# @evolu/server

## 1.0.11

### Patch Changes

- Updated dependencies [8f7c8c8]
  - @evolu/common@1.0.11

## 1.0.10

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/common@1.0.10

## 1.0.9

### Patch Changes

- ad267b4: Update deps
- Updated dependencies [ad267b4]
  - @evolu/common@1.0.9

## 1.0.8

### Patch Changes

- 3f89e12: Update deps
- Updated dependencies [3f89e12]
  - @evolu/common@1.0.8

## 1.0.7

### Patch Changes

- a938b3d: Update deps
- Updated dependencies [a938b3d]
  - @evolu/common@1.0.7

## 1.0.6

### Patch Changes

- 43ae617: Update peer dependencies
- Updated dependencies [43ae617]
  - @evolu/common@1.0.6

## 1.0.5

### Patch Changes

- 0b53b45: Update deps
- Updated dependencies [0b53b45]
  - @evolu/common@1.0.5

## 1.0.4

### Patch Changes

- ac05ef2: Update deps
- Updated dependencies [ac05ef2]
  - @evolu/common@1.0.4

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

- 21f41b0: Update deps
- Updated dependencies [21f41b0]
  - @evolu/common@1.0.1

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/common@1.0.0
