# Evolu: A platform for user-owned apps

**Version 1.0**

**Date: August 6, 2025**

## Abstract

Traditional client-server architectures centralize data control, creating dependencies on external services and limiting user autonomy. Local-first software emerged as a response, promoting apps that store data locally and work offline. However, the term has grown broad, often encompassing apps that still rely on external infrastructure, lack end-to-end encryption, or offer limited user control. This flexibility has driven adoption, but leaves developers without a clear framework for building truly autonomous, privacy-preserving applications.

Evolu is a platform for user-owned applications—apps where users control their data, their access, and the infrastructure they depend on. Built on a strict local-first foundation, Evolu combines local SQLite storage, encrypted CRDT synchronization, blind relays, and a portable access control model based on cryptographically derived owners.

By enforcing end-to-end encryption, enabling relay migration, and supporting fine-grained collaboration, Evolu gives developers the tools to build apps that are not just offline-capable, but truly user-sovereign.

## Introduction

Modern apps increasingly demand collaboration, synchronization, and privacy—but achieving these goals without introducing centralized control has remained difficult. Even open-source or self-hosted solutions often depend on cloud services, developer-run backends, or complex DevOps setups.

Evolu addresses this gap by providing a platform for building user-owned apps: local-first, end-to-end encrypted applications that remain fully functional offline and sync seamlessly when connected. Instead of relying on traditional backends, Evolu apps synchronize through blind relays—minimal, generic infrastructure that transports encrypted data without ever decrypting or interpreting it. These relays are replaceable and portable, designed to be easy to run, migrate, or abandon.

At the heart of Evolu is a protocol based on cryptographically derived owners, which define who can read, write, and sync each portion of the application’s data. This model supports various forms of collaboration, from private local-first use to decentralized multi-party applications—without compromising privacy or control.

This whitepaper introduces the Evolu architecture, protocol, and synchronization model. It outlines the principles behind user-owned apps, explains Evolu’s access control mechanisms, and describes how developers can build portable, resilient applications without centralized infrastructure or platform lock-in.

## Architecture Overview

Evolu consists of four core components:

1. **Owners** – Encrypted partitions of application data
2. **Clients** – Local apps that read, write, and sync owner data
3. **CRDT Sync Protocol** – A reconciliation engine based on HLC and RBSR
4. **Relays** – Blind message routers that forward encrypted data

## Owners

In Evolu, owners define a logical partition of application data, with a unique set of keys that determine who can read and write to that partition.

This model allows Evolu apps to split data into independently controlled and synchronized units—supporting everything from personal notes to collaborative group spaces.

Owners are derived from a 16-byte entropy seed using SLIP-21, producing:

- **OwnerId**: a globally unique public identifier
- **EncryptionKey**: a symmetric key used to encrypt and decrypt data
- **WriteKey**: a secret key granting write access (optional and rotatable)

An Evolu app may use multiple owners to support distinct privacy scopes, sync behavior, or collaboration models.

### Owner Types

Evolu defines several standard owner types for common use cases:

#### AppOwner

Represents private, user-controlled application state.

- **Used for**: personal data, preferences, drafts
- **Write access**: single user
- **Backup**: exportable as a 12-word mnemonic

#### SharedOwner

Supports write access by multiple participants.

- **Used for**: group chats, shared documents, collaborative editing
- **Write access**: distributed via the shared WriteKey
- **Read access**: shared EncryptionKey

#### SharedReadonlyOwner

Read-only version of SharedOwner.

- **Used for**: public feeds, announcements
- **Write access**: none (WriteKey omitted)
- **Read access**: shared EncryptionKey

#### ShardOwner

Optional owner used to isolate secondary data.

- **Used for**: media files, analytics, optional features
- **Purpose**: reduces sync size and improves performance
- **Derived**: can be deterministically derived from AppOwner

#### RelayOwner

Used by a relay to manage its own configuration.

- **Evolu-native**: relays sync their config like any other Evolu client
- **Stores**: connection keys, write key policies, rate limits
- **Enables**: live relay updates without downtime

## Synchronization

Evolu synchronizes encrypted data using a combination of **Hybrid Logical Clocks (HLCs)** and **Range-Based Set Reconciliation (RBSR)**.

### Hybrid Logical Clock (HLC)

Each change in Evolu is tagged with a **Hybrid Logical Clock timestamp**, combining:

- **Physical time** in milliseconds (to approximate wall-clock order)
- A **logical counter** (to resolve concurrent events on the same node)
- A **node identifier** (to guarantee global uniqueness)

This timestamp acts as a globally sortable identifier for every change.

### CRDT Messages

Changes are grouped into **CRDT messages**, each consisting of:

- A unique HLC **timestamp**
- A **database change** (encrypted before sync)

These messages form an append-only event log, allowing clients to independently merge changes without coordination.

### Range-Based Set Reconciliation (RBSR)

Evolu uses RBSR to determine which CRDT messages are missing between peers. Instead of syncing entire logs or relying on shared histories, RBSR compares **fingerprints** of timestamp ranges.

This allows peers to:

- Reconcile large datasets efficiently, even with partial overlap
- Avoid redundant message transfers
- Sync deterministically without shared state
- Avoid per-peer metadata, enabling Evolu to support many peers without stateful relay storage

RBSR enables Evolu to scale logarithmically with the number of changes. For example, reconciling a million entries may take only a few round-trips.

### Why It Matters

This synchronization model:

- **Preserves privacy**: All synced data is encrypted client-side
- **Supports partial sync**: Apps can sync time ranges or specific owners
- **Eliminates server state**: Relays are stateless and disposable
- **Scales efficiently**: Logarithmic sync performance, minimal overhead

## Relay

Evolu Relay is a minimal, blind, and application-agnostic server used to synchronize encrypted data between clients.

Its purpose is to provide **availability**, **delivery**, and **basic access control**—nothing more.

### Blind by Design

All messages sent through a relay are encrypted end-to-end. The relay never has access to app data. Relays operate on encrypted blobs and route them based solely on `OwnerId`. This guarantees privacy and enables relays to be interchangeable and untrusted.

### Stateless and Replaceable

Relays maintain no per-client sync state or message history. They store only minimal configuration for access control and abuse protection. This lightweight design has key benefits:

- **Horizontal scalability**: Any number of relays can serve the same owner in parallel
- **Relay portability**: Users can migrate to another relay at any time
- **Zero vendor lock-in**: Relays can be replaced, forked, or self-hosted without breaking sync

### Generic Infrastructure

Relays are not specific to any application. They serve as **dumb pipes**—only validating write permissions and applying basic rate limiting or abuse protection. All business logic, collaboration rules, and access decisions are handled on the client.

Relays can be run by:

- App developers (to offer hosted sync)
- End users (for private networks or backup)
- Third parties (as a public utility)

### Minimal Access Model

Each write operation includes a `WriteKey`, proving authorization to append data. The relay:

- Validates the `WriteKey` against the `OwnerId`
- Enforces rate limits (to prevent spam or abuse)
- Optionally applies **storage quotas** (to limit resource use)
- Requires **connection keys** (application-issued tokens) to establish a relay connection

Read access is determined entirely by possession of the correct `EncryptionKey`—which is never shared with the relay.

Admins configure these protections based on their use case.

### Metadata Obfuscation

Although relays cannot decrypt content, they still observe metadata such as timestamps, message frequency, and connection patterns. This metadata can be obscured using techniques like:

- **Dummy traffic** – Fake writes indistinguishable from real messages
- **Timing jitter** – Randomized delays between sync attempts to mask user activity
- **Size padding (PADME)** – Evolu uses the PADME algorithm to standardize message sizes and resist traffic analysis
- **Decoy keys** – Fake owners or write keys generating background noise

## Access Control and Collaboration

Evolu separates access control from data control through its multi-owner architecture. Each owner defines its own encryption and write permissions, enabling flexible collaboration patterns—from simple link-based sharing to robust group governance.

### One SharedOwner: Simple Collaboration

The simplest collaboration model uses a single `SharedOwner`, which can be shared with others—for example, using a link.

- **Anyone with the link** can read and write
- **No authentication or identity tracking** required
- **Ideal for** ephemeral sessions, whiteboards, or quick drafts

This model maximizes simplicity.

### The Two-Owner Pattern: Structured Groups

For collaborative spaces with structure, moderation, or long-term persistence, Evolu supports the two-owner pattern, where responsibilities are split:

**SharedReadonlyOwner: Admin Layer**

- Stores metadata like channel structure, roles, and moderation rules
- Only the group creator (admin) holds the WriteKey
- Readable by all group participants
- Defines the shared "constitution"

**SharedOwner: Message Layer**

- Stores user-generated content (messages, edits, uploads)
- Writable by all users with the shared WriteKey
- Readable by all with the shared EncryptionKey
- Represents the shared discussion space

This model enables practical moderation, forkability, and abuse recovery—without relying on central authorities.

### Many Owners: Composable Applications

Evolu apps can subscribe to many owners at once—mixing private, shared, and public data partitions into a single local view.

This enables **composable applications**, where data is modular and portable across apps:

- A **profile owner** reused across apps to share name, photo, or bio
- A **calendar app** referencing contacts or notes from other owners
- A **notes app** linking to tasks or calendar events

Instead of copying data, apps simply add owners. This architecture supports **local-first Single Sign-On** and seamless **cross-app collaboration**, without shared servers or central coordination.

## Roles and Responsibilities

Evolu enforces a clear architectural boundary between infrastructure, application logic, and governance.

### Relay Responsibilities

- Validate `WriteKey`s for append operations
- Enforce connection keys and rate limits
- Never decrypt or inspect data

### Client Responsibilities

- Validate incoming data (e.g. schema, size, signatures)
- Decide what to display or ignore
- Implement app-specific collaboration rules

### Admin Responsibilities

- Monitor patterns via metadata (e.g. excessive writes)
- Detect abuse or spam via relay-level visibility
- Respond by rotating keys or creating clean owners

When abuse occurs, the typical mitigation is architectural: create a new `SharedOwner`, migrate valid content, and update the reference in the `SharedReadonlyOwner`. This avoids the need for server-side filtering and preserves user control.

## Public-Key Cryptography

So far, Evolu has been described as a delivery and authentication service—synchronizing encrypted data between peers using symmetric keys, with relays enforcing access through connection and write keys. For many applications, this symmetric model is good enough.

However, symmetric encryption has limitations:

- **No authentication** – It doesn’t prove who sent a message
- **No scalable key updates** – Rotating encryption keys across a group doesn’t scale
- **No forward secrecy or post-compromise security** – Past or future messages may be exposed if a key is compromised

There is no one-size-fits-all model for collaboration. Different apps have different needs.

Evolu does not enforce a single cryptographic stack. Instead, it exposes a flexible API and plugin model that allows apps to bring their own identity and key management strategies when needed. This includes support for public-key cryptography to handle more advanced use cases—such as verifiable identities, scalable key rotation, or enhanced privacy guarantees.

### MLS: Messaging Layer Security

> Note: MLS integration is planned and not yet implemented. This section describes intended functionality; details may change as the design is finalized.

For apps that need stronger guarantees, Evolu supports **MLS (Messaging Layer Security)** as an optional plugin for secure group communication. MLS is a modern protocol designed to manage encryption keys for dynamic groups efficiently. It provides:

- **Scalable group key rotation**
- **Authenticated messaging**
- **Forward and post-compromise security**
- **Efficient handling of joins and removals**

This makes MLS a strong fit for Evolu apps with large or changing groups where symmetric keys alone fall short.

When a group member is removed, Evolu ensures they lose both relay access and the ability to decrypt future messages—by rotating to a new encryption key and creating a new shared owner. MLS automates this process, keeping group state consistent and secure across all members.
