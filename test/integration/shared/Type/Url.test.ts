import { describe, it } from "vitest";
import { assertEqual } from "../../../../packages/common/src/Assert.ts";
import {
  HttpUrlFromString,
  Url,
  UrlFromString,
} from "../../../../packages/common/src/Type.ts";
import { urlCases } from "../../../../packages/react-native/test/device/urlCases.ts";

describe("Url", () => {
  it("transforms each case as the platform URL serializes it", () => {
    assertEqual(
      urlCases.map(([value]) => {
        const url = UrlFromString.fromUnknown(value);
        return [value, url.ok ? url.value : null] as const;
      }),
      urlCases,
    );
  });

  it("accepts only canonical spellings", () => {
    for (const [value, canonical] of urlCases) {
      assertEqual(Url.is(value), value === canonical);
      if (canonical !== null) assertEqual(Url.is(canonical), true);
    }
  });

  it("transforms only HTTP and HTTPS URLs to HttpUrl", () => {
    for (const [value, canonical] of urlCases) {
      assertEqual(
        HttpUrlFromString.fromUnknown(value).ok,
        canonical !== null &&
          (canonical.startsWith("http://") || canonical.startsWith("https://")),
      );
    }
  });
});
