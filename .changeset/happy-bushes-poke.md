---
"@evolu/common": patch
---

Explained in their errors why computeBalancedBuckets and createPadmePaddedLength throw

`computeBalancedBuckets` throws when `numberOfBuckets` times
`minNumberOfItemsPerBucket` exceeds `Number.MAX_SAFE_INTEGER`, and
`createPadmePaddedLength` and `createPadmePadding` throw for a length above
2^53 - 2^46. Both used to throw only "The value … must be a safe integer." Their
errors now say which input is too large, and `computeBalancedBuckets` documents
when it throws.
