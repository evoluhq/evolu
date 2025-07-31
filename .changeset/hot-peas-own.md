---
"@evolu/common": patch
---

# Owners refactor and external AppOwner support

## 🚀 Features

- **External AppOwner Support**: `AppOwner` can now be created from external keys without sharing the mnemonic with the Evolu app. The `mnemonic` property is now optional, allowing for better security when integrating with external authentication systems.

- **New Config Option**: Added `initialAppOwner` configuration option to specify a pre-existing AppOwner when creating an Evolu instance, replacing the previous `mnemonic` option for better encapsulation.

## 🔄 Breaking Changes

- **Owner API Redesign**: Complete refactor of the Owner system with cleaner, more focused interfaces:
  - Simplified `Owner` interface with only essential properties (`id`, `encryptionKey`, `writeKey`)
  - Removed temporal properties (`createdAt`, `timestamp`) from core Owner interface
  - Eliminated complex `OwnerRow` and `OwnerWithWriteAccess` types

- **Database Schema Changes**:
  - Replaced `evolu_owner` table with streamlined `evolu_config` table
  - New `evolu_version` table for protocol versioning
  - Simplified storage of AppOwner data in single config row

- **Configuration Changes**:
  - `Config.mnemonic` replaced with `Config.initialAppOwner`
  - More explicit control over owner initialization

## ✨ Improvements

- **Enhanced Documentation**: Comprehensive JSDoc with clear explanations of owner types, use cases, and examples
- **Clock Management**: New internal clock system for better timestamp handling
- **Test Coverage**: Extensive test suite covering all owner types and edge cases

## 🔧 Internal Changes

- **Database Initialization**: Refactored database setup to use new schema with better separation of concerns
- **Protocol Updates**: Updated to protocol version 0 with new storage format
