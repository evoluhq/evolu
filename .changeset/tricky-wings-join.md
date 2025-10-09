---
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/web": patch
---

# Transport-Based Configuration System

# Transport-Based Configuration System

**BREAKING CHANGE**: Replaced `syncUrl` with flexible `transport` property supporting single transport or array of transports for multiple sync endpoints.

## What Changed

- **Removed** `syncUrl` property from Evolu config
- **Added** `transport` property accepting a single `Transport` object or array of `Transport` objects
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

**After (single transport):**

```ts
const evolu = createEvolu(deps)(Schema, {
  transport: { type: "WebSocket", url: "wss://relay.example.com" },
});
```

**After (multiple transports):**

```ts
const evolu = createEvolu(deps)(Schema, {
  transport: [
    { type: "WebSocket", url: "wss://relay1.example.com" },
    { type: "WebSocket", url: "wss://relay2.example.com" },
  ],
});
```

## Benefits

- **Single or multiple relay support**: Use one transport for simplicity or multiple for redundancy
- **Intuitive API**: Singular property name that accepts both single item and array
- **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
- **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously when using arrays
- **Type safety**: Full TypeScript support for transport configurations

## Future Transport Types

The new system is designed to support upcoming transport types:

- `FetchRelay`: HTTP-based polling for environments without WebSocket support
- `Bluetooth`: P2P sync for offline collaboration
- `LocalNetwork`: LAN/mesh sync for local networks

## Technical Details

- Single transports are automatically normalized to arrays internally
- CRDT messages are sent to all connected transports simultaneously
- Duplicate message handling relies on CRDT idempotency (no deduplication needed)
- WebSocket connections auto-reconnect independently
- Backwards compatibility removed (preview version breaking change)

This change provides an intuitive API that scales from simple single-transport setups to complex multi-transport configurations, positioning Evolu for a more resilient, multi-transport future.
