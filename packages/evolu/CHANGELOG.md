# evolu

## 0.4.0

### Minor Changes

- 74a94ee: Add config reloadUrl

## 0.3.1

### Patch Changes

- 15fa758: Make useMutation mutate stable

## 0.3.0

### Minor Changes

- fcdbff9: Add onComplete to mutate function

## 0.2.2

### Patch Changes

- 127f1ae: Add SQLiteError

  This error should happen only in Firefox's private mode, which does not support IndexedDB.

## 0.2.1

### Patch Changes

- fd03f74: Fix useEvoluFirstDataAreLoaded bug.

  Empty table did not generate any patch so onQuery did not update queriesRowsCache.

## 0.2.0

### Minor Changes

- 96a0954: Add useEvoluFirstDataAreLoaded React Hook

  React Hook returning `true` if any data are loaded. It's helpful to prevent screen flickering as data are loading. React Suspense would be better, but we are not there yet.

## 0.1.7

### Patch Changes

- ec6d9f2: Add isLoaded to useQuery React Hook

## 0.1.6

### Patch Changes

- d903dd2: Refactor types

## 0.1.5

### Patch Changes

- 3a78e4c: Remove dev comment

## 0.1.4

### Patch Changes

- 309f99f: Publish Evolu source code to NPM

  "I get so annoyed when "go to definition" just takes me to typescript def files rather than actual code."

## 0.1.3

### Patch Changes

- fee19a7: Expose Zod string and number

## 0.1.2

### Patch Changes

- 5244c0c: Kysely 0.22.0 and remove a mutation from its interface

## 0.1.1

### Patch Changes

- 5d820a1: Add some TS comments

## 0.1.0

### Minor Changes

- a0fab5e: Add Evolu test server for sync and backup
