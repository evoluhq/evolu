/**
 * Strings and the canonical `Url` each one transforms to, or `null` for one
 * that is not an absolute URL. Node.js, Chromium, Firefox, WebKit, and the
 * whatwg-url-minimum that Expo installs on React Native all agree on them,
 * which the device suites and the shared Type tests of the repository check.
 *
 * @module
 */

export const urlCases: ReadonlyArray<readonly [string, string | null]> = [
  // Canonical spellings.
  ["https://example.com/", "https://example.com/"],
  ["https://example.com:8443/a?q=1#f", "https://example.com:8443/a?q=1#f"],
  ["wss://free.evoluhq.com/", "wss://free.evoluhq.com/"],
  ["mailto:Someone@Example.com", "mailto:Someone@Example.com"],
  ["javascript:alert(1)", "javascript:alert(1)"],
  ["data:text/plain,Hello World", "data:text/plain,Hello World"],
  ["urn:isbn:0451450523", "urn:isbn:0451450523"],
  ["blob:https://example.com/uuid", "blob:https://example.com/uuid"],
  ["file:///C:/a", "file:///C:/a"],
  ["https://user:pass@example.com/", "https://user:pass@example.com/"],

  // The empty path of a special scheme, case, and default ports.
  ["https://example.com", "https://example.com/"],
  ["HTTPS://Example.COM/a", "https://example.com/a"],
  ["https://example.com:443/", "https://example.com/"],
  ["http://example.com:80/", "http://example.com/"],
  ["ws://Example.com", "ws://example.com/"],
  ["wss://example.com:443/", "wss://example.com/"],
  ["https://example.com#", "https://example.com/#"],
  ["https://example.com?", "https://example.com/?"],
  ["https://@example.com/", "https://example.com/"],

  // Paths, queries, and fragments.
  ["https://example.com/a/../b", "https://example.com/b"],
  ["https://example.com/a/./b/", "https://example.com/a/b/"],
  ["https://example.com/a b", "https://example.com/a%20b"],
  ["https://example.com/?q=a b#f g", "https://example.com/?q=a%20b#f%20g"],
  ["https://example.com/ä?q=ä#ä", "https://example.com/%C3%A4?q=%C3%A4#%C3%A4"],
  ["https://example.com/%7e", "https://example.com/%7e"],

  // Whitespace and backslashes.
  ["  https://example.com/  ", "https://example.com/"],
  ["https://exa\nmple.com/", "https://example.com/"],
  ["https:\\\\example.com\\a", "https://example.com/a"],

  // Internationalized domain names.
  ["https://münchen.de/", "https://xn--mnchen-3ya.de/"],
  ["https://MÜNCHEN.de/", "https://xn--mnchen-3ya.de/"],
  ["https://日本.jp/", "https://xn--wgv71a.jp/"],

  // IP address hosts.
  ["http://0x7f.1/", "http://127.0.0.1/"],
  ["http://127.1/", "http://127.0.0.1/"],
  ["http://[0:0::1]/", "http://[::1]/"],
  ["http://[::FFFF:1.2.3.4]/", "http://[::ffff:102:304]/"],

  // Not absolute URLs.
  ["", null],
  ["not a url", null],
  ["/a", null],
  ["//example.com/", null],
  ["https://", null],
  ["https://[::1", null],
  ["https://example.com:99999/", null],
  ["http://256.0.0.1/", null],
  ["http://1.2.3.4.5/", null],
];
