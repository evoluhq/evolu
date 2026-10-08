---
"@evolu/common": minor
---

Added Data and byte length error formatters to every Type locale

Every locale module in `@evolu/common/intl` now exports `formatDataError`,
`formatByteLengthError`, and `formatByteLengthFromStringError`, so Types that
contain `Data`, `ByteLength`, or `ByteLengthFromString` can be localized
without writing formatters for their errors.

```ts
import { assertEqual, assertErr, Data, localizeTypes } from "@evolu/common";
import { cs } from "@evolu/common/intl";

const typesByLocale = localizeTypes(
  { Data },
  { cs: { Data: cs.formatDataError } },
);

const result = typesByLocale.cs.Data.fromUnknown(Symbol("id"));
assertErr(result);
assertEqual(
  typesByLocale.cs.Data.formatError(result.error),
  "Hodnota Symbol(id) není Data.",
);
```
