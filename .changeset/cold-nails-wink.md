"@evolu/common": patch

Add a typed helper `createRecord` for safely creating prototype-less
`Record<K, V>` instances (via `Object.create(null)`). This prevents
prototype pollution and accidental key collisions for object keys that come
from external sources, like database column names.
