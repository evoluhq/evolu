import {
  array,
  Boolean,
  createRefCount,
  Unknown,
  withDefault,
} from "@evolu/common";

// Invalid Type declarations are readable compile-time errors.
// @ts-expect-error ⛔ Type error: withDefault requires an optional property or a Type whose Output includes null or undefined.
withDefault(Boolean, true);

// Arrays with holes are rejected, whatever the element Type.
array(Unknown).is(["a", , "c"]); // false

// A disposed object can't be used. No one can repair data on users' devices,
// so broken invariants throw before they corrupt it.
const counter = createRefCount();
counter[Symbol.dispose]();
counter.increment(); // Throws "Cannot use a disposed object."
