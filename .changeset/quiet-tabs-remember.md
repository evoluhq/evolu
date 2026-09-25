---
"@evolu/common": minor
"@evolu/react-web": minor
"@evolu/web": minor
---

Fixed apps that stayed blank where the browser offers no storage

Safari's Private Browsing offers no OPFS, so Evolu could not open its database
there, and the app waited forever without reporting an error. Evolu now checks
storage once when its shared worker starts, and without it keeps every database
in memory for as long as that worker runs, which is while any tab of the app is
open. Data synced with a relay comes back, as on a new device, and nothing stays
on the device afterwards, which suits checking your app on a borrowed phone. A
persistent database the browser cannot reach right now is left untouched. Data
that exists only locally, or has not synced yet, is lost when the tab hosting
the database closes, even while other tabs stay open.

The new `onStorageUnavailable` option of the web and React web
`createEvoluDeps` tells the app, so it can tell the user, for example "Nothing
from this session is kept on this device."

A custom platform adapter must handle the new `StorageUnavailable` shared
worker message in an exhaustive switch, and a platform that can lack persistent
storage can give the shared worker `isPersistentStorageAvailable`.
