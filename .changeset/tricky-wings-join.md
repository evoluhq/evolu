---
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/web": patch
---

# Transport-Based Configuration System

**BREAKING CHANGE**: Replaced `syncUrl` with extensible `transports` array configuration for multiple sync endpoints and future transport types.

## What Changed

- **Removed** `syncUrl` property from Evolu config
- **Added** `transports` property accepting an array of `Transport` objects
- **Added** `Transport` type union with initial WebSocket support
- **Updated** sync system to support Nostr-style relay pools with simultaneous connections
- **Updated** all examples and documentation to use new transport configuration

## Migration Guide

**Before:**

```ts
const evolu = createEvolu(deps)(Schema, {
  syncUrl: "wss://relay.example.com",
});
```

**After:**

```ts
const evolu = createEvolu(deps)(Schema, {
  transports: [{ type: "WebSocket", url: "wss://relay.example.com" }],
});
```

## Benefits

- **Multiple relay support**: Configure multiple WebSocket relays for redundancy
- **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
- **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously
- **Type safety**: Full TypeScript support for transport configurations

## Future Transport Types

The new system is designed to support upcoming transport types:

- `FetchRelay`: HTTP-based polling for environments without WebSocket support
- `Bluetooth`: P2P sync for offline collaboration
- `LocalNetwork`: LAN/mesh sync for local networks

## Technical Details

- CRDT messages are now sent to all connected transports simultaneously
- Duplicate message handling relies on CRDT idempotency (no deduplication needed)
- WebSocket connections auto-reconnect independently
- Backwards compatibility removed (preview version breaking change)

This change positions Evolu for a more resilient, multi-transport future while maintaining the simplicity of the current WebSocket-based sync.
