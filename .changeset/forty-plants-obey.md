---
"@evolu/oxlint-config": minor
---

Enabled linting of generated empty object types

The shared config now reports type operations that resolve to `{}`, such as `Omit<Row | null, "id">`, `Pick<Row, never>`, or `Record<never, never>`. `{}` accepts any non-nullish value, including numbers and strings, so such a type silently stops checking. The rule is oxlint's `typescript/no-generated-empty-object-type`, which the suspicious category includes since oxlint 1.86. Write `{}` where an empty object type is intended.
