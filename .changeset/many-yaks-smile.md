---
"@evolu/common-react": patch
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/server": patch
---

Update Kysely to 0.27.0

Check [Kysely release](https://github.com/kysely-org/kysely/releases/tag/0.27.0)

Note simplified `$narrowType` usage. Previous:

```ts
.$narrowType<{ title: NonEmptyString1000 }>()
```

Simplified:

```ts
.$narrowType<{ title: NotNull }>()
```
