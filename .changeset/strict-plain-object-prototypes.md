---
"@evolu/common": patch
---

Tightened plain-object prototype detection

Plain-object APIs now use a realm-neutral structural heuristic. They accept a
`null` prototype or an immediate root prototype with own `hasOwnProperty` and
`isPrototypeOf` properties. This recognizes ordinary Objects from another
JavaScript realm without relying on prototype identity.

A custom root prototype with the same shape can therefore be classified as
plain. The heuristic assumes trusted JavaScript and is not a prototype
authentication or security boundary. Other custom prototypes and class
instances are rejected; replace them with plain Objects and materialize required
inherited values as own properties.
