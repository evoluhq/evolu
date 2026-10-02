---
"@evolu/web": patch
---

Fixed Chrome keeping the Evolu instances of a tab in its back-forward cache

When the user navigated away and Chrome kept the page in its back-forward cache,
the shared worker kept that tab's Evolu instances until Chrome dropped the page.
Meanwhile it kept syncing their owners, which other tabs still listed in their
sync state, and kept rerunning their queries. A tab now releases its instances
when the page enters the cache, as it already stopped the database workers it
hosts, and disposing the deps releases them too.
