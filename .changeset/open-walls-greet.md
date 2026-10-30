---
"@evolu/common": minor
---

Added Url, UrlFromString, HttpUrl and HttpUrlFromString Types

`Url` accepts an absolute URL only in the canonical spelling the [WHATWG URL Standard](https://url.spec.whatwg.org/) serializes, so equal URLs are equal strings on an engine, and `UrlFromString` converts any other spelling, such as user input, to it. `HttpUrl` and `HttpUrlFromString` do the same for `http:` and `https:` URLs. Use them for links, because `Url` accepts any scheme, including `javascript:`. Evolu does not validate the values other devices write, so transform a link read from the database with `HttpUrlFromString` before rendering or opening it.

The Types validate with the platform's `URL`, which browsers, Node.js, and Expo SDK 58 and later provide. React Native without Expo needs a conformant `URL` installed, such as `whatwg-url-minimum` 0.2 or later, as the `react-native` example does.

```ts
import {
  assertErr,
  assertOk,
  HttpUrl,
  HttpUrlFromString,
  Url,
  UrlFromString,
} from "@evolu/common";

assertOk(
  UrlFromString.fromUnknown(" HTTPS://Example.com:443/a/../b "),
  "https://example.com/b",
);
assertErr(Url.fromUnknown("https://example.com"));

assertOk(
  HttpUrlFromString.fromUnknown("https://münchen.de"),
  "https://xn--mnchen-3ya.de/",
);
assertErr(HttpUrl.fromUnknown("javascript:alert(1)"));
```
