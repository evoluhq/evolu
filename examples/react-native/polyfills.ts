import { installPolyfills } from "@evolu/react-native/polyfills";
import { URL, URLSearchParams } from "whatwg-url-minimum";

installPolyfills();

// React Native's own URL accepts strings that are not URLs and reads no host
// from a ws: or wss: URL, so Evolu's Url Types, including RelayUrl and
// WebSocketUrl, need one that follows the WHATWG URL Standard, as Expo
// installs. Its URL.createObjectURL throws, so React Native's blob URLs stay.
const reactNativeUrl = globalThis.URL;
Object.assign(URL, {
  createObjectURL: (blob: Blob) => reactNativeUrl.createObjectURL(blob),
  revokeObjectURL: (url: string) => {
    reactNativeUrl.revokeObjectURL(url);
  },
});
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
