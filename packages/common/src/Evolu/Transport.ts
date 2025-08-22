import { brand, String } from "../Type.js";

export interface WebSocketTransportConfig {
  readonly type: "WebSocket";
  readonly url: string;
}

// Future transport config types:
// | { readonly type: "FetchRelay"; readonly url: string }
// | { readonly type: "Bluetooth" }
// | { readonly type: "LocalNetwork"; readonly host: string }
export type TransportConfig = WebSocketTransportConfig;

// Base interface for transport instances
// TODO: extends Disposable.
export interface TransportInstance {
  readonly send: (message: string) => void;
  readonly close: () => void;
}

/** Unique identifier for a transport configuration used for deduplication. */
export const TransportId = brand("TransportId", String);
export type TransportId = typeof TransportId.Type;

/** Creates a unique identifier for a transport configuration. */
export const getTransportId = (
  transportConfig: TransportConfig,
): TransportId => {
  return `ws:${transportConfig.url}` as TransportId;
};
