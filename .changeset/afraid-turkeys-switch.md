---
"@evolu/common": major
---

Add Config name property and remove LocalStorage support.

It's a breaking change only because PlatformName was restricted. There is no change in sync protocol so that all data can be safely restored.
