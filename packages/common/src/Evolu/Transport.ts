// DEV: It will not be here.

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Transport = { readonly type: "WebSocket"; readonly url: string };
// Future transport types (not yet implemented):
// | { readonly type: "FetchRelay"; readonly url: string }    // HTTP-based polling/push
// | { readonly type: "Bluetooth" }                           // P2P Bluetooth
// | { readonly type: "LocalNetwork"; readonly host: string } // LAN/mesh sync
