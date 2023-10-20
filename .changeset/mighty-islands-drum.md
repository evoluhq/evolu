---
"@evolu/common-react": patch
"@evolu/react-native": patch
"@evolu/common-web": patch
"@evolu/common": patch
"@evolu/server": patch
"@evolu/react": patch
---

Ensure valid device clock and Timestamp time.

Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.
