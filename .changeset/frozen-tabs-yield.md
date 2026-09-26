---
"@evolu/web": patch
---

Fixed tabs that stalled or stopped saving after Safari's back-forward cache

Safari keeps a page the user navigates away from frozen in its back-forward
cache. When that page's tab hosted the database, the app's other tabs, and any
tab opened later, waited until the page was restored or dropped. When the user
went back, the page looked normal but silently dropped every write. A page
entering the back-forward cache now stops the database workers it hosts, so
another tab takes the database over as if the tab had closed, and a page
restored from the cache reloads.

As when a tab closes, data kept only in memory, as in Safari's Private
Browsing, is lost when the tab hosting the database navigates away. A cached
page of an older build still keeps a newer build waiting until Safari drops the
page or the user goes back to it.
