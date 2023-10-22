# @evolu/react

## 2.0.6

### Patch Changes

- 9d319e5: Rename canUseDOM to canUseDom
- Updated dependencies [9d319e5]
  - @evolu/common-web@1.1.5
  - @evolu/common@1.0.13
  - @evolu/common-react@1.0.7

## 2.0.5

### Patch Changes

- 094e25a: Expose and leverage canUseDOM
- Updated dependencies [094e25a]
  - @evolu/common-web@1.1.4
  - @evolu/common@1.0.12
  - @evolu/common-react@1.0.7

## 2.0.4

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

- Updated dependencies [44caee5]
- Updated dependencies [44caee5]
  - @evolu/common-react@1.0.7
  - @evolu/common-web@1.1.3
  - @evolu/common@1.0.10

## 2.0.3

### Patch Changes

- ad267b4: Update deps
- Updated dependencies [ad267b4]
  - @evolu/common-react@1.0.6
  - @evolu/common-web@1.1.2
  - @evolu/common@1.0.9

## 2.0.2

### Patch Changes

- a938b3d: Update deps
- Updated dependencies [a938b3d]
  - @evolu/common-react@1.0.5
  - @evolu/common-web@1.1.1
  - @evolu/common@1.0.7

## 2.0.1

### Patch Changes

- 43ae617: Update peer dependencies
- Updated dependencies [43ae617]
  - @evolu/common-react@1.0.4
  - @evolu/common@1.0.6
  - @evolu/common-web@1.1.0

## 2.0.0

### Patch Changes

- Updated dependencies [6674c78]
  - @evolu/common-web@1.1.0

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency
- Updated dependencies [0a6f7e7]
  - @evolu/common-react@1.0.2
  - @evolu/common-web@1.0.1
  - @evolu/common@1.0.2

## 1.0.1

### Patch Changes

- 768427c: Fix files in @evolu/common-react package.json
- Updated dependencies [768427c]
  - @evolu/common-react@1.0.1

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries

### Patch Changes

- Updated dependencies [17e43c8]
  - @evolu/common-react@1.0.0
  - @evolu/common-web@1.0.0
  - @evolu/common@1.0.0
