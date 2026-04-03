---
"@evolu/common": major
---

Removed the root `kysely` namespace export and exposed Evolu's SQLite JSON helpers as explicit named exports.

Use `evoluJsonArrayFrom`, `evoluJsonObjectFrom`, `evoluJsonBuildObject`, `kyselySql`, and `KyselyNotNull` from `@evolu/common` instead of `kysely.jsonArrayFrom`, `kysely.jsonObjectFrom`, `kysely.jsonBuildObject`, `kysely.sql`, and `kysely.NotNull`.

```ts
// Before
import { kysely } from "@evolu/common";

kysely.jsonArrayFrom(...)
type Name = kysely.NotNull;

// After
import {
  evoluJsonArrayFrom,
  evoluJsonBuildObject,
  evoluJsonObjectFrom,
  kyselySql,
  type KyselyNotNull,
} from "@evolu/common";

evoluJsonArrayFrom(...)
type Name = KyselyNotNull;
```
