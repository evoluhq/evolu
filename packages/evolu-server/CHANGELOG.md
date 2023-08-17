# evolu-server

## 1.0.10

### Patch Changes

- Updated dependencies [bcf25b6]
  - evolu@6.2.0

## 1.0.9

### Patch Changes

- Updated dependencies [ad8fa27]
  - evolu@6.1.4

## 1.0.8

### Patch Changes

- Updated dependencies [5eaeec0]
  - evolu@6.1.3

## 1.0.7

### Patch Changes

- Updated dependencies [fef4007]
  - evolu@6.1.2

## 1.0.6

### Patch Changes

- Updated dependencies [f378902]
  - evolu@6.1.1

## 1.0.5

### Patch Changes

- Updated dependencies [f70280d]
  - evolu@6.1.0

## 1.0.4

### Patch Changes

- Updated dependencies [3876a99]
- Updated dependencies [7ab1057]
  - evolu@6.0.3

## 1.0.3

### Patch Changes

- Updated dependencies [f585bd4]
  - evolu@6.0.2

## 1.0.2

### Patch Changes

- Updated dependencies [182bd28]
  - evolu@6.0.1

## 1.0.1

### Patch Changes

- Updated dependencies [c7f5182]
  - evolu@6.0.0

## 1.0.0

### Major Changes

- 590d5a8: Port Evolu from fp-ts to Effect

  Nothing changed except Evolu is internally using [Effect](https://www.effect.website) instead of fp-ts now. Because of that, I refactored all source code hence a major change.

  Effect is [the successor](https://dev.to/effect-ts/a-bright-future-for-effect-455m) of fp-ts. If you already know fp-ts, you will understand it quickly. If you don't know fp-ts yet, skip it, and learn Effect instead. Give it five minutes, and you will love it.

  The devil's advocate question: Could Evolu be written without Effect? It could be, but the source code would be uglier, brittle, and slower. Let me explain it. For now, Evolu is using a synchronous version of SQLite. But soon, we will also use asynchronous SQLite for other platforms where synchronous SQLite is not available. With Effect, the code is the same. Without Effect, we would always use Promises, even for synchronous code. Or we would have to write the same logic twice. As for brittle code, Effect catches and can recover from all errors. As for uglier code, errors we can expect are typed. And much more. I believe Effect will be the next big thing in the JavaScript ecosystem.

### Patch Changes

- Updated dependencies [590d5a8]
  - evolu@5.0.0

## 0.1.3

### Patch Changes

- Updated dependencies [3140595]
  - evolu@4.1.2

## 0.1.2

### Patch Changes

- Updated dependencies [a6a308c]
  - evolu@4.1.1

## 0.1.1

### Patch Changes

- Updated dependencies [edef64d]
  - evolu@4.1.0
