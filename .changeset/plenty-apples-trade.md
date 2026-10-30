---
"@evolu/common": patch
---

Fixed reading the OwnerId from relay URLs with other query parameters

A relay that admits connections with `isOwnerAllowed` read the OwnerId from whatever followed the first `=` in the request URL. It refused a URL with another query parameter or with `=` in its path, and read an OwnerId from a parameter with another name. `parseOwnerIdFromOwnerWebSocketTransportUrl` now reads only the `ownerId` query parameter and returns `null` when it's missing or repeated. The URLs that `createOwnerWebSocketTransport` creates were read correctly before unless the relay URL had `=` in its path, and now always are.
