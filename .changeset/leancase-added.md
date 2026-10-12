---
"@evolu/common": minor
---

added experimental leancase

leancase is a minimal writing style: everything is lowercase except code in
backticks or a code fence, urls with a scheme, @handles, and #hashtags, and a
line that ends a sentence has no final period, though an ellipsis stays.
`leancase` converts plain text to it, and `LeancasedString` and the `leancased`
brand factory validate it. converting leancase text again changes nothing, so
a string is valid exactly when `leancase` leaves it unchanged. every built-in
locale formats `LeancasedError`

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  leancase,
  LeancasedString,
} from "@evolu/common";

assertEqual(
  leancase("I noticed people write like this. It saves typing."),
  "i noticed people write like this. it saves typing",
);
assertEqual(
  leancase("I build AI tools with Lean, WASM, and C."),
  "i build ai tools with lean, wasm, and c",
);
assertEqual(
  leancase(
    "Call `leancase()`, then read https://evolu.dev/docs/api-reference/common/Leancase.",
  ),
  "call `leancase()`, then read https://evolu.dev/docs/api-reference/common/Leancase",
);
assertEqual(
  leancase("Thanks @Steida for #LocalFirst!"),
  "thanks @Steida for #LocalFirst!",
);
assertEqual(leancase("Wait..."), "wait...");

assertOk(LeancasedString.fromUnknown("hello. world"), "hello. world");
assertErr(LeancasedString.fromUnknown("Hello. World."));
```

leancase is experimental, so its rules may change in a minor or patch release
