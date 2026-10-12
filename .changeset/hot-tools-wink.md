---
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/relay": patch
---

Kept one connection from blocking the relay

The relay handled each WebSocket message as soon as it arrived. A burst of cheap
requests on one connection blocked every other connection for seconds, one
request of many cheap ranges, such as empty Timestamps ranges, took about a
second, and a client that did not read its replies made the relay queue them
without limit.

The relay now serves each connection's requests one at a time and serves other
connections in between. It does not read a connection while its requests wait,
and it serves the next one only after the previous reply is written, so a client
that sends faster than it reads is slowed down instead of growing the relay's
memory. A request waiting for an asynchronous `isOwnerWithinQuota` holds the
later requests of its connection, so the callback should settle quickly.

One sync answer makes a bounded number of storage reads. Past that limit its
frame closes and the rest syncs in the next round, so one request holds the
relay for at most about half a second, even for an owner of hundreds of
thousands of changes. Limit connections per IP address in a reverse proxy in
front of the relay.
