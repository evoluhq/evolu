import type * as Common from "@evolu/common";
import type * as LocalFirst from "@evolu/common/local-first";
import type * as CommonPolyfills from "@evolu/common/polyfills";
import type * as Nodejs from "@evolu/nodejs";
import type * as React from "@evolu/react";
import type * as ReactNative from "@evolu/react-native";
import type * as ExpoSqlite from "@evolu/react-native/expo-sqlite";
import type * as ReactNativePolyfills from "@evolu/react-native/polyfills";
import type * as ReactWeb from "@evolu/react-web";
import type * as Svelte from "@evolu/svelte";
import type * as Vue from "@evolu/vue";
import type * as Web from "@evolu/web";
import "@evolu/react-native/bare-op-sqlite";
import "@evolu/react-native/expo-op-sqlite";

export type PublishedApis = readonly [
  typeof Common,
  typeof LocalFirst,
  typeof CommonPolyfills,
  typeof Nodejs,
  typeof React,
  typeof ReactNative,
  typeof ExpoSqlite,
  typeof ReactNativePolyfills,
  typeof ReactWeb,
  typeof Svelte,
  typeof Vue,
  typeof Web,
];
