# Evolu Relay Administration Architecture

**Status: Draft (Work in Progress)**  
This document is an exploratory design. APIs, data shapes, and flows are subject to change before a stabilized spec is added under /spec or referenced in the WHITEPAPER.

## Overview

Evolu Relay administration enables secure, collaborative applications while maintaining local-first principles. Users can create, manage, and migrate between relays without vendor lock-in, supporting both private and collaborative use cases.

## Core Principles

- **Local-first**: All data and keys remain with users; relays are replaceable infrastructure
- **Blind relays**: Relays only handle encrypted data and access control, never decrypt content
- **URL-as-token**: Access tokens embedded in relay URLs eliminate need for user identity management
- **Standardized admin API**: Common interface across all relay implementations for portability

## Architecture Components

### 1. Relay Access Model

**Connection Tokens (ConnectionKeys):**
Relay admin creates connection tokens that gate access to the relay itself. Clients must present a valid connection token to open a WebSocket connection.

**Access Flow:**

1. User visits relay website and completes authentication (captcha, payment, OAuth)
2. Relay generates unique connection token: `wss://relay.evoluhq.com/sync?token=9t_DP58JUjghKlRP8AWOT`
3. User configures Evolu client with this URL
4. Relay validates connection token before allowing any sync operations

**Capability Model:**

```
encryptionKey → who can read (decrypt data)
writeKey      → who can write (append data)
connectionKey → who can connect (open sync connection)
```

**Read Access Policy:**
By default, clients with valid connection tokens can sync any Owner. This enables:

- Clients creating new Owners dynamically
- Open collaboration and data sharing
- Zero-friction sync for encrypted data

Optional restriction to specific OwnerIds can be configured per connection token for tighter control.

**Benefits:**

- No persistent user identity required
- Simple revocation by disabling tokens
- Usage tracking per token without knowing user identity
- Privacy-preserving access control
- Separation of connection access from data access

### 2. Owner Types and Collaboration

**Owner Architecture:**

- **AppOwner**: Read-only owner controlled by app admin, points to active SharedOwner
- **SharedOwner**: Collaborative space where users write with distributed WriteKeys
- **RelayOwner**: Special owner for relay configuration (see Configuration section)

**Migration and Security:**

- Admin detects abuse via timestamps and WriteKey correlation
- Creates new SharedOwner and migrates valid data
- Updates AppOwner to point to new SharedOwner
- Deletes compromised SharedOwner
- Users automatically follow migration by syncing AppOwner

### 3. WriteKey Management

**Write Access Control:**

- Relay enforces WriteKey validation for all write operations
- Admin can issue WriteKeys per user or shared across group
- WriteKey rotation supported for security and access management
- Public key signatures in DbChanges enable user accountability

**Admin Actions:**

- Set/revoke WriteKeys per Owner
- Rotate WriteKeys for security
- Track usage and correlate with relay access tokens
- Delete Owners and clean up data

### 4. Relay Configuration

**RelayOwner Pattern:**

- Relay runs its own Evolu instance to sync configuration data
- Real-time configuration updates without restart
- Evolu-native approach using standard sync protocol

```typescript
interface RelayConfig {
  readonly connectionTokens: readonly {
    readonly id: string; // UUID or hash of token
    readonly token: string; // 32-64 byte random string
    readonly allowedOwnerIds?: readonly OwnerId[]; // optional filtering
    readonly expiresAt?: number;
    readonly revoked?: boolean;
    readonly rateLimit?: { readonly perMinute: number };
  }[];
  readonly ownerWriteKeys: readonly {
    readonly ownerId: OwnerId;
    readonly writeKey: WriteKey;
  }[];
}
```

### 5. Authentication Options

**Free Relays:**

- Captcha-based access control
- Rate limiting and usage monitoring
- Basic anti-abuse protection

**Paid/Protected Relays:**

- OpenID Connect (OIDC) integration
- Support for major identity providers (Google, GitHub, Auth0, etc.)
- Self-hosted auth servers
- JWT-based access tokens

**Standards-Based:**

- OAuth 2.0 compliance for client compatibility
- Portable across different relay providers
- Flexible authentication backends

## Standardized Admin API

All relay implementations must support these operations:

```typescript
interface RelayAdmin {
  // Owner management
  readonly createOwner: (
    ownerId: OwnerId,
    writeKey: WriteKey,
  ) => Result<void, AdminError>;
  readonly deleteOwner: (ownerId: OwnerId) => Result<void, AdminError>;

  // WriteKey management
  readonly setWriteKey: (
    ownerId: OwnerId,
    writeKey: WriteKey,
  ) => Result<void, AdminError>;
  readonly rotateWriteKey: (
    ownerId: OwnerId,
    newWriteKey: WriteKey,
  ) => Result<void, AdminError>;
  readonly revokeWriteKey: (
    ownerId: OwnerId,
    writeKey: WriteKey,
  ) => Result<void, AdminError>;

  // Connection token management
  readonly createConnectionToken: (options?: {
    readonly allowedOwnerIds?: readonly OwnerId[];
    readonly expiresAt?: number;
    readonly rateLimit?: { readonly perMinute: number };
  }) => Result<ConnectionToken, AdminError>;
  readonly revokeConnectionToken: (tokenId: string) => Result<void, AdminError>;
  readonly getActivity: (
    timeRange: TimeRange,
  ) => Result<ActivityLog, AdminError>;
}
```

## User Flows

### Creating a Collaborative App

1. **Setup Relay**: Purchase/configure relay with authentication
2. **Create AppOwner**: Generate read-only owner for app infrastructure
3. **Create SharedOwner**: Generate collaborative space with WriteKeys
4. **Configure AppOwner**: Point to active SharedOwner
5. **Distribute Access**: Share relay URLs and WriteKeys with collaborators

### User Migration (Credible Exit)

1. **Create New Relay**: Admin sets up alternative relay
2. **Configure WriteKeys**: Set up access control for group members
3. **Update AppOwner**: Point to new SharedOwner on new relay
4. **Notify Users**: Share new relay URLs
5. **Automatic Migration**: Users sync AppOwner and follow to new relay

### Abuse Response

1. **Detect Abuse**: Monitor timestamps and correlate with WriteKeys
2. **Identify Source**: Cross-reference with relay access logs
3. **Migrate Data**: Create new SharedOwner, copy valid data
4. **Update References**: Point AppOwner to clean SharedOwner
5. **Revoke Access**: Delete compromised Owner and connection tokens

## Philosophy of Decentralization

Evolu's approach to decentralization is pragmatic rather than idealistic. True decentralization is not the absence of authority, but rather the redistribution of authority to users.

**Key Insights:**

- There is no such thing as pure decentralization—only control shifted to more local or personal centers
- Broadcast-based systems face fundamental limitations: you can't control who receives data, only who can decrypt it
- Encryption protects meaning, not transport—and that's sufficient for most use cases

**Evolu's Model:**
Rather than pursuing the "Holy Grail" of completely decentralized systems, Evolu provides:

- **Portable authority**: Users can move their center (relay) at any time
- **Forkable infrastructure**: Anyone can run their own relay
- **Optional coordination**: Relays provide availability and enforcement, but are not lock-in points

This approach acknowledges that some level of coordination and authority is necessary for practical systems, while ensuring that authority remains with users rather than platforms.

## Benefits

- **True Portability**: Switch relays without losing data or breaking collaboration
- **Granular Control**: Fine-grained access management per user and per Owner
- **Privacy-First**: Minimal user data collection, blind relay operation
- **Standards-Based**: Compatible with existing OAuth/OIDC infrastructure
- **Real-time Admin**: Configuration changes propagate immediately
- **Credible Exit**: Always maintain ability to migrate away from any relay provider

## Implementation Status

This architecture is designed for future implementation. Current Evolu relays are basic sync servers without administration features. The standardized admin API and authentication flows described here represent the roadmap for enabling collaborative Evolu applications.
