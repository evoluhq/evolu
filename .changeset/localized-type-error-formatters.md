---
"@evolu/common": minor
---

Added localized Type error formatter modules

Added formatter modules for Arabic, Bengali, Catalan, Chinese, Croatian, Czech,
Danish, Dutch, Filipino, Finnish, French, German, Greek, Hebrew, Hindi,
Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Malayalam, Marathi,
Norwegian Bokmål, Persian, Polish, Portuguese, Punjabi, Romanian, Slovak,
Slovenian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian,
Urdu, and Vietnamese. Import each module from `@evolu/common/intl` and provide
its formatters to `localizeTypes`.

Completed Czech formatters for Set and the remaining built-in Types that own
validation errors, including EvoluType, Base64Url, Name, Mnemonic, Id, TableId,
Int64String, and DateIsoFromDate.
