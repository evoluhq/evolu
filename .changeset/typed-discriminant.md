---
"@evolu/common": minor
---

Added `Typed` interface and `typed` factory for discriminated unions

Discriminated unions model mutually exclusive states where each variant is a distinct type. This makes illegal states unrepresentable — invalid combinations cannot exist.

```ts
// Type-only usage for static discrimination
interface Pending extends Typed<"Pending"> {
  readonly createdAt: DateIso;
}
interface Shipped extends Typed<"Shipped"> {
  readonly trackingNumber: TrackingNumber;
}
type OrderState = Pending | Shipped;

// Runtime validation with typed() factory
const Pending = typed("Pending", { createdAt: DateIso });
const Shipped = typed("Shipped", { trackingNumber: TrackingNumber });
```
