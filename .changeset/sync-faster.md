---
"@evolu/common": patch
---

Made sync use less CPU and, with small ranges sections, fewer rounds

Measured against 8.17.0 on an Apple M5, counting the protocol's CPU time
without storage:

- A relay sending 20,000 changes uses 8% less CPU, and 21% less when the changes
  are close to the 1 MB message size. A client uploading 20,000 changes uses 12%
  less. A message under construction now references the changes it carries and
  copies each one once, into the finished message, instead of copying it while
  building and again when finishing.
- `decryptAndDecodeDbChange` uses 9% less CPU, because decoding no longer
  validates again what a value's branded type already proves.
- With a `ProtocolMessageRangesMaxSize` of 3,000, syncs where each side lacks
  changes the other has take 9% to 15% fewer rounds, because messages are
  measured exactly and no longer keep safety margins unused. With the default
  of 30,000, they take the same rounds.
