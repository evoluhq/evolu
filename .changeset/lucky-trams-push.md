---
"@evolu/common": patch
---

Fixed sync requests multiplying when several databases use one owner

When two or more databases in one app, Evolu instances with a different
`appName` or `appOwner`, synced the same owner through the same relay, each of
them answered every relay reply for that owner with its own continuation. A
catch-up longer than one frame then multiplied its requests by the number of
databases with every round: two databases downloading 5.7 MB received 126
frames, 107 MB, instead of 12.

Now only the database whose request a reply answers continues it. The other
databases store the reply's messages without reconciling it, so each database
sends one request per round. Databases using one owner through one relay take
turns: while one database's requests for the owner are unanswered, another's
wait.
