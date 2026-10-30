import { describe, it } from "vitest";
import {
  assertEqual,
  assertErr,
} from "../../../../packages/common/src/Assert.ts";
import {
  HttpUrlFromString,
  Url,
  UrlFromString,
} from "../../../../packages/common/src/Type.ts";
import {
  WebSocketUrl,
  WebSocketUrlFromString,
} from "../../../../packages/common/src/WebSocket.ts";
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

// Four labels of 63, 63, 63, and 61 characters with three dots.
const host253 = [63, 63, 63, 61].map((length) => "a".repeat(length)).join(".");

describe("WebSocketUrl", () => {
  it("transforms only WebSocket URLs without a fragment or credentials", () => {
    for (const [value, canonical] of urlCases) {
      assertEqual(
        WebSocketUrlFromString.fromUnknown(value).ok,
        canonical !== null &&
          (canonical.startsWith("ws://") || canonical.startsWith("wss://")) &&
          !canonical.includes("#"),
      );
    }
  });

  it("accepts canonical WebSocket URLs", () => {
    for (const url of [
      "ws://localhost:4000/",
      "wss://free.evoluhq.com/",
      "wss://relay.example/sync?ownerId=1",
      "ws://127.0.0.1:4000/",
      "ws://[::1]:4000/",
      "wss://xn--mnchen-3ya.de/",
      // A trailing dot ends a fully qualified name, which DNS limits don't
      // count.
      "wss://example.com./",
      `wss://${"a".repeat(63)}.example/`,
      `wss://${"a".repeat(63)}:4000/`,
      `wss://${host253}/`,
      `wss://${host253}./`,
      "ws://localhost:1/",
      "ws://localhost:65535/",
      "ws://my_relay:4000/",
      "ws://[::ffff:7f00:1]:4000/",
      // Every character java.net.URI allows in a path and a query.
      "wss://relay.example/a-._~!$&'()*+,;=:@/%2F?b-._~!$&()*+,;=:@/?[]%2F",
    ])
      assertEqual(WebSocketUrl.is(url), true);
  });

  it("rejects URLs a WebSocket can't connect to as they are", () => {
    for (const url of [
      "https://example.com/",
      "javascript:alert(1)",
      "wss://example.com/#",
      "wss://example.com/#sync",
      "wss://user@example.com/",
      "wss://user:pass@example.com/",
      "wss://:pass@example.com/",
      "wss://a..example/",
      `wss://${"a".repeat(64)}.example/`,
      `wss://${host253}a/`,
      // React Native on Android throws natively for these.
      "ws://localhost:0/",
      'wss://a"b.example/',
      "wss://a{b.example/",
      "wss://relay.example/a]b",
      "wss://relay.example/a[b",
      "wss://relay.example/100%",
      "wss://relay.example/%zz",
      "wss://relay.example/%E0%A4%A",
      "wss://relay.example/?t={x}",
      "wss://relay.example/?t=a^b",
      "wss://relay.example/?t=a\\b",
      "wss://relay.example/?t=100%",
      "wss://relay.example/?t=%zz",
      "wss://relay.example/?t=a|b",
      "wss://relay.example/?t=a`b",
    ]) {
      // A canonical Url that only WebSocketUrl's own check rejects.
      assertErr(WebSocketUrl.fromUnknown(url), {
        type: "WebSocketUrl",
        value: url,
      });
      assertErr(WebSocketUrlFromString.fromUnknown(url), {
        type: "WebSocketUrlFromString",
        value: url,
      });
    }
  });

  it("transforms other spellings to the canonical one", () => {
    assertEqual(
      WebSocketUrlFromString.fromUnknown("WSS://Free.EvoluHQ.com:443"),
      { ok: true, value: "wss://free.evoluhq.com/" },
    );
    assertEqual(WebSocketUrlFromString.fromUnknown("ws://localhost:4000"), {
      ok: true,
      value: "ws://localhost:4000/",
    });
  });

  it("encodes the canonical spelling", () => {
    const url = WebSocketUrl.orThrow("wss://relay.example/sync?ownerId=1");
    assertEqual(WebSocketUrlFromString.to(url), url);
  });
});
